const fs = require('fs-extra')
const XLSX = require('xlsx')
const csvStr = require('csv-stringify/lib/sync')

exports.getCSV = async (filePath) => {
  const data = await fs.readFile(filePath)
  const workbook = XLSX.read(data, { cellDates: true })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]

  // console.log(worksheet)
  // const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, sheetStubs: true })
  let json = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, sheetStubs: true })

  if (!json || json.length < 2) throw new Error('La première feuille du classeur dans le fichier ne contient pas de table.')

  // fix dates
  for (let r = 0; r < json.length; r++) {
    for (let c = 0; c < json[r].length; c++) {
      const cellRef = XLSX.utils.encode_cell({ c, r })
      const cell = worksheet[cellRef]

      if (cell && cell.t && cell.t === 'd') {
        // cf https://github.com/SheetJS/sheetjs/issues/134#issuecomment-288323169
        delete cell.w
        delete cell.z
        XLSX.utils.format_cell(cell, null, { dateNF: 'YYYY-MM-DD' })
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
