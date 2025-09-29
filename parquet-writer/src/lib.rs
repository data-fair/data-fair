#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;

// mod arrow;
mod schema;
mod parquet_writer;
mod buffer_writer;

use crate::parquet_writer::*;
// use crate::arrow::*;
use crate::schema::*;

#[napi(js_name = "ParquetWriter")]
pub struct JsParquetWriter {
  parquet_writer: ParquetWriter,
}
 
#[napi]
impl JsParquetWriter {
  #[napi(constructor)]
  pub fn new(basic_schema: Vec<BasicSchemaProperty>, buffer: Buffer) -> Self {
    JsParquetWriter { parquet_writer: ParquetWriter::new(basic_schema, buffer) }
  }

  #[napi]
  pub fn add_rows(&mut self, rows: Vec<Object<'_>>) {
    self.parquet_writer.add_rows(rows);
  }

  #[napi]
  pub fn finish(&mut self) {
    self.parquet_writer.finish();
  }
}
