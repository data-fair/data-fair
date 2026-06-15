declare module 'number-abbreviate' {
  class NumberAbbreviate {
    constructor (units?: string[])
    abbreviate: (number: number, decimalPlaces?: number) => string
  }
  export default NumberAbbreviate
}
