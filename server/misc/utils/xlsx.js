const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const XLSX = require('xlsx')
const Excel = require('exceljs')
const { stringify: csvStr } = require('csv-stringify/sync')

dayjs.extend(utc)

// The following is an attempt at using ExcelJS streaming parser,
// but is it not viable while this PR is not accepted (https://github.com/exceljs/exceljs/pull/1570)
// /**
//  * @param {string} filePath
//  */
// exports.iterCSV = async function * (filePath) {
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

// exports.getCSV = async (filePath) => {
//   let data = ''
//   for await (const row of exports.iterCSV(filePath)) {
//     data += row
//   }
//   console.log(data)
//   return data
// }

// cf https://github.com/exceljs/exceljs/blob/master/lib/csv/csv.js#L127
/**
 * @param {any} value
 * @returns {string}
 */
const mapCellValue = (value) => {
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

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
exports.getCSV = async (filePath) => {
  const workbook = new Excel.Workbook()
  try {
    await workbook.xlsx.readFile(filePath)
  } catch (err) {
    console.log('failed to use Excel module to parse file, use older parser', err)
    return await getCSVOld(filePath)
  }
  const worksheet = workbook.getWorksheet(1)

  // fallback to previous implementation
  if (!worksheet) return await getCSVOld(filePath)

  const json = /** @type {((string | number | Date | undefined)[])[]} */(worksheet.getSheetValues().filter(row => !!row))

  // loop on dates to check if there is a need for date-time format or if date is enough
  /** @type {Record<number, boolean>} */
  const hasSimpleDate = {}
  let ignoredStartingCols = 0
  for (let lineNb = 0; lineNb < Math.min(json.length, 10000); lineNb++) {
    const row = json[lineNb]
    if (!row) continue
    for (let colNb = 0; colNb < row.length; colNb++) {
      if (lineNb === 0) {
        if (row[colNb] === undefined && colNb === ignoredStartingCols) ignoredStartingCols++
      } else {
        if (hasSimpleDate[colNb] === false) continue
        if (row[colNb] instanceof Date) {
          if (dayjs(row[colNb]).utc().toISOString().endsWith('T00:00:00.000Z')) hasSimpleDate[colNb] = true
          else hasSimpleDate[colNb] = false
        }
      }
    }
  }

  for (let lineNb = 0; lineNb < json.length; lineNb++) {
    const row = json[lineNb]
    if (!row) continue
    for (let colNb = 0; colNb < row.length; colNb++) {
      row[colNb] = mapCellValue(row[colNb])
      // @ts-ignore
      if (hasSimpleDate[colNb]) row[colNb] = row[colNb].replace('T00:00:00.000Z', '')
    }
    row.splice(0, ignoredStartingCols)
  }

  return csvStr(json)
}

// previous implementation using xlsx module.. kept around as a fallback and for ODS format
/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
const getCSVOld = async (filePath) => {
  const workbook = XLSX.readFile(filePath, { cellDates: true })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]

  // console.log(worksheet)
  // const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, sheetStubs: true })
  let json = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, sheetStubs: true })

  if (!json || json.length < 2) throw new Error('La première feuille du classeur dans le fichier ne contient pas de table.')

  const hasTime = {}

  // first loop on dates to check if there is a need for date-time format or if date is enough
  for (let r = 0; r < json.length; r++) {
    for (let c = 0; c < json[r].length; c++) {
      const cellRef = XLSX.utils.encode_cell({ c, r })
      const cell = worksheet[cellRef]

      if (cell && cell.t && cell.t === 'd') {
        delete cell.w
        delete cell.z
        XLSX.utils.format_cell(cell, null, { dateNF: 'YYYY-MM-DD HH:mm:ss' })
        if (cell.w.split(' ')[1] !== '00:00:00' && !cell.v.toISOString().endsWith('T00:00:00.000Z')) hasTime[c] = true
      }
    }
  }

  // fix dates
  for (let r = 0; r < json.length; r++) {
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
  }

  // remove empty lines
  json = json.filter(row => {
    return !!row.find(cell => cell !== null && cell !== undefined && cell !== '')
  })

  // remove empty headers
  /* TODO: uncomment after adding a test case
  let emptyHeader
  while ((emptyHeader = json[0].findIndex(header => header === '')) !== -1) {
    json.forEach(row => row.splice(emptyHeader, 1))
  } */
  return csvStr(json)
}
