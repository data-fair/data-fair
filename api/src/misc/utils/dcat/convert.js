import { RdfXmlParser } from 'rdfxml-streaming-parser'
import { JsonLdSerializer } from 'jsonld-streaming-serializer'
import { Writable, Transform } from 'stream'
import pump from '../pipe.ts'

/**
 * @param {string} dcat
 * @param {string} baseIRI
 * @returns
 */
export const fromXML = async (dcat, baseIRI) => {
  const intoStream = (await import('into-stream')).default
  const myParser = new RdfXmlParser({ validateUri: false, baseIRI })
  const mySerializer = new JsonLdSerializer({ space: '  ' })
  let lastChunk = ''
  const logger = new Transform({
    transform (chunk, encoding, callback) {
      lastChunk = chunk.toString()
      callback(null, chunk)
    }
  })
  myParser.on('error', (err) => {
    console.error('parsing error', err)
    console.log('last chunk', lastChunk)
  })
  let json = ''
  await pump(intoStream(dcat), logger, myParser, mySerializer, new Writable({
    write (chunk, encoding, callback) {
      json += chunk.toString()
      callback()
    }
  }))
  return JSON.parse(json)
  // // @ts-ignore
  // const rdf = xml2js(dcat, { compact: true })['rdf:RDF']
  // if (!rdf) throw new Error('expected a root RDF element')
  // const rdfDescription = rdf['rdf:Description']
  // if (!rdfDescription) throw new Error('expected a root RDF/Description element')
  // /** @type Record<string, string> */
  // const context = {}
  // for (const key of Object.keys(rdf._attributes)) {
  //   if (key.startsWith('xmlns:')) context[key.replace('xmlns:', '')] = rdf._attributes[key]
  // }
  // console.log(context)
  // delete rdfDescription._parent
  // delete rdfDescription._attributes
  // resolveType(rdfDescription)
  // resolveCDATA(rdfDescription, ['title', 'description'])
  // console.log(rdfDescription)
  // return { '@context': context }
  // return { '@context': context, ...rdfDescription }
}
