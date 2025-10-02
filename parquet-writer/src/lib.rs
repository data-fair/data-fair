#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;

mod buffer_writer;
mod parquet_writer;
mod schema;

use crate::parquet_writer::*;
use crate::schema::*;

#[napi(js_name = "ParquetWriter")]
pub struct JsParquetWriter {
  parquet_writer: ParquetWriter,
}

#[napi]
impl JsParquetWriter {
  #[napi(constructor)]
  pub fn new(basic_schema: Vec<BasicSchemaProperty>) -> Self {
    JsParquetWriter {
      parquet_writer: ParquetWriter::new(basic_schema),
    }
  }

  #[napi]
  pub fn add_rows(&mut self, env: Env, rows: Vec<Object<'_>>) -> BufferSlice<'_> {
    let data = self.parquet_writer.add_rows(rows);
    BufferSlice::from_data(&env, data).unwrap()
  }

  #[napi]
  pub fn finish(&mut self, env: Env) -> BufferSlice<'_> {
    let data = self.parquet_writer.finish();
    BufferSlice::from_data(&env, data).unwrap()
  }
}
