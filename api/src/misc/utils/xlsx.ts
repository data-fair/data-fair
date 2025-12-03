import { stringify as csvStr } from 'csv-stringify/sync'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import { type WorkSheet } from '@e965/xlsx'

dayjs.extend(utc)

type NormalizeOptions = {
  spreadsheetWorksheetIndex?: number;
  spreadsheetHeaderLine?: number;
  spreadsheetStartCol?: number;
}

// The following is an attempt at using ExcelJS streaming parser,
// but is it not viable while this PR is not accepted (https://github.com/exceljs/exceljs/pull/1570)
// /**
//  * @param {string} filePath
//  */
//  export const iterCSV = async function * (filePath) {
//   // loop on dates to check if there is a need for date-time format or if date is enough

//   const workbook = new Excel.Workbook()
//   await workbook.xlsx.readFile(filePath)
//   console.log(workbook.getWorksheet(1)?.getRow(2))

//   /** @type {Record<number, boolean>} */
//   const hasSimpleDate = {}
//   const ignoredCells = new Set()

//   for await (const worksheetReader of new Excel.stream.xlsx.WorkbookReader(filePath, {})) {
//     // @ts-ignore
//     if (worksheetReader.id !== 1) break
//     let lineCt = 0
//     for await (const row of worksheetReader) {
//       if (lineCt > 10000) break
//       lineCt++

//       console.log(row.values)

//       const dateCell = row.getCell(2)
//       console.log(dateCell.value)
//       // console.log(dateCell.type)
//       // console.log(Excel.ValueType.Number)
//       console.log(dateCell.numFmt)
//       console.log(dateCell.text)
//       // console.log(dateCell.type === Excel.ValueType.Date)
//       // console.log(dateCell.value instanceof Date)

//       const values = /** @type {(string | number | undefined)[]} */(row.values)

//       for (let i = 0; i < values.length; i++) {
//         const value = values[i]
//         if (lineCt === 1 && value === undefined) ignoredCells.add(i)
//         if (ignoredCells.has(i)) continue
//         if (hasSimpleDate[i] === false) continue
//         if (typeof value === 'string') {
//           const date = new Date(value)
//           // @ts-ignore
//           if (date instanceof Date && !isNaN(date)) {
//             if (!value.endsWith('T00:00:00Z')) hasSimpleDate[i] = false
//             else if (hasSimpleDate[i] !== false) hasSimpleDate[i] = true
//           } else {
//             hasSimpleDate[i] = false
//           }
//         }
//       }
//     }
//   }
//   console.log('2')

//   for await (const worksheetReader of new Excel.stream.xlsx.WorkbookReader(filePath, {
//     entries: 'emit',
//     sharedStrings: 'cache',
//     hyperlinks: 'cache',
//     styles: 'cache',
//     worksheets: 'emit'
//   })) {
//     // @ts-ignore
//     if (worksheetReader.id !== 1) break
//     for await (const row of worksheetReader) {
//       const values = /** @type {(string | number | undefined)[]} */(row.values)
//       /** @type {[(string | number | undefined)[]]} */
//       const actualValues = [[]]
//       for (let i = 0; i < values.length; i++) {
//         if (ignoredCells.has(i)) continue
//         let value = values[i]
//         if (typeof value === 'string' && hasSimpleDate[i]) value = value.replace('T00:00:00Z', '')
//         actualValues[0].push(value)
//       }
//       yield csvStr(actualValues)
//     }
//   }
//   console.log('3')
// }

//  export const getCSV = async (filePath) => {
//   let data = ''
//   for await (const row of iterCSV(filePath)) {
//     data += row
//   }
//   console.log(data)
//   return data
// }

// cf https://github.com/exceljs/exceljs/blob/master/lib/csv/csv.js#L127
const mapCellValue = (value: any): string => {
  if (value) {
    if (value.text || value.hyperlink) {
      return value.hyperlink || value.text || ''
    }
    if (value.formula || value.result) {
      return value.result || ''
    }
    if (value instanceof Date) {
      return dayjs.utc(value).toISOString()
    }
    if (value.error) {
      return value.error
    }
    if (typeof value === 'object') {
      return JSON.stringify(value)
    }
  }
  return value
}

export const iterCSV = async function * (filePath: string, normalizeOptions: NormalizeOptions = {}) {
  const worksheet = await getWorksheet(filePath, normalizeOptions.spreadsheetWorksheetIndex ?? 1)
  if (worksheet) {
    yield * iterCsv(worksheet, normalizeOptions)
  } else {
    yield * iterCsvOld(filePath, normalizeOptions)
  }
}

const getWorksheet = async (filePath: string, worksheetIndex: number) => {
  const Excel = (await import('exceljs')).default
  const workbook = new Excel.Workbook()
  try {
    await workbook.xlsx.readFile(filePath)
  } catch (err) {
    console.log('failed to use Excel module to parse file, use older parser', err)
    return
  }
  const worksheet = workbook.getWorksheet(worksheetIndex)

  // fallback to previous implementation
  if (!worksheet) {
    console.log('failed to extract worksheet using Excel module, use older parser')
    return
  }

  return worksheet
}

const iterCsv = async function * (worksheet: WorkSheet, normalizeOptions: NormalizeOptions) {
  const json: ((string | number | Date | undefined)[])[] = worksheet.getSheetValues()
  // attempt to free some memory now that values were extracted
  delete worksheet['!rows']

  // loop on dates to check if there is a need for date-time format or if date is enough
  const hasSimpleDate: Record<number, boolean> = {}
  let ignoredStartingRows = normalizeOptions.spreadsheetHeaderLine ? normalizeOptions.spreadsheetHeaderLine : 0

  if (normalizeOptions.spreadsheetHeaderLine === undefined) {
    for (let lineNb = 0; lineNb < Math.min(json.length, 10000); lineNb++) {
      const row = json[lineNb]
      if (!row) {
        ignoredStartingRows++
        continue
      } else {
        break
      }
    }
  }

  let ignoredStartingCols = normalizeOptions.spreadsheetStartCol ?? 0
  for (let lineNb = 0; lineNb < Math.min(json.length, 10000); lineNb++) {
    // ignore empty lines
    if (lineNb < ignoredStartingRows) continue
    const row = json[lineNb]
    // check empty first cols on first data line
    if (lineNb === ignoredStartingRows) {
      if (normalizeOptions.spreadsheetStartCol === undefined) {
        for (let colNb = 0; colNb < row.length; colNb++) {
          if (row[colNb] === undefined && colNb === ignoredStartingCols) ignoredStartingCols++
        }
      }
      continue
    }
    // some type checking
    for (let colNb = 0; colNb < row.length; colNb++) {
      if (hasSimpleDate[colNb] === false) continue
      if (row[colNb] instanceof Date) {
        if (dayjs(row[colNb]).utc().toISOString().endsWith('T00:00:00.000Z')) hasSimpleDate[colNb] = true
        else hasSimpleDate[colNb] = false
      }
    }
  }

  json.splice(0, ignoredStartingRows)

  let rowsBuffer = []
  for (let lineNb = 0; lineNb < json.length; lineNb++) {
    const row = json[lineNb]
    if (!row) continue
    if (lineNb > 0) {
      for (let colNb = 0; colNb < row.length; colNb++) {
        row[colNb] = mapCellValue(row[colNb])
        // @ts-ignore
        if (hasSimpleDate[colNb] && row[colNb]) row[colNb] = row[colNb].replace('T00:00:00.000Z', '')
      }
    }
    row.splice(0, ignoredStartingCols)
    // attempt to free memory as we go
    // @ts-ignore
    json[lineNb] = null
    rowsBuffer.push(row)
    if (rowsBuffer.length > 1000) {
      yield csvStr(rowsBuffer)
      rowsBuffer = []
    }
  }

  if (rowsBuffer.length) yield csvStr(rowsBuffer)
}

const alphabet = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// previous implementation using xlsx module.. kept around as a fallback and for ODS format
const iterCsvOld = async function * (filePath: string, normalizeOptions: NormalizeOptions) {
  const worksheetIndex = normalizeOptions.spreadsheetWorksheetIndex ?? 1
  // It is strongly recommended to use CommonJS in NodeJS.
  // https://docs.sheetjs.com/docs/getting-started/installation/nodejs#usage
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const XLSX = require('@e965/xlsx')

  const workbook = XLSX.readFile(filePath, { cellDates: true })
  const worksheet = workbook.Sheets[workbook.SheetNames[worksheetIndex - 1]]
  let range = worksheet['!ref']
  if (normalizeOptions.spreadsheetHeaderLine !== undefined || normalizeOptions.spreadsheetStartCol !== undefined) {
    const [, end] = range.split(':')
    const startCol = normalizeOptions.spreadsheetStartCol ? alphabet[normalizeOptions.spreadsheetStartCol] : 'A'
    const startRow = normalizeOptions.spreadsheetHeaderLine ?? 1
    range = `${startCol}${startRow}:${end}`
  }
  const json: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, range })
  if (!json || json.length < 2) throw new Error(`La feuille ${worksheetIndex} du classeur dans le fichier ne contient pas de table.`)

  const hasTime: Record<number, boolean> = {}

  // first loop on dates to check if there is a need for date-time format or if date is enough
  for (let r = 0; r < Math.min(json.length, 10000); r++) {
    for (let c = 0; c < json[r].length; c++) {
      const cellRef = XLSX.utils.encode_cell({ c, r })
      const cell = worksheet[cellRef]

      if (cell && cell.t && cell.t === 'd') {
        delete cell.w
        delete cell.z
        XLSX.utils.format_cell(cell, null, { dateNF: 'YYYY-MM-DD HH:mm:ss' })
        if (cell.w.split(' ')[1] !== '00:00:00' && cell.v.toISOString && !cell.v.toISOString().endsWith('T00:00:00.000Z')) {
          hasTime[c] = true
        }
      }
    }
  }
  let rowsBuffer = []
  for (let r = 0; r < json.length; r++) {
    // fix dates
    for (let c = 0; c < json[r].length; c++) {
      const cellRef = XLSX.utils.encode_cell({ c, r })
      const cell = worksheet[cellRef]

      if (cell && cell.t && cell.t === 'd') {
        // cf https://github.com/SheetJS/sheetjs/issues/134#issuecomment-288323169
        delete cell.w
        delete cell.z
        XLSX.utils.format_cell(cell, null, { dateNF: hasTime[c] ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD' })
        json[r][c] = cell.w
      }
    }

    if (!json[r] || !json[r].find((cell: any) => cell !== null && cell !== undefined && cell !== '')) continue

    // attempt to free memory as we go
    rowsBuffer.push(json[r])
    json[r] = null
    if (rowsBuffer.length > 100) {
      yield csvStr(rowsBuffer)
      rowsBuffer = []
    }
  }
  if (rowsBuffer.length) yield csvStr(rowsBuffer)
}
