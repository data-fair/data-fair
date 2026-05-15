#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::any::Any;
use std::panic::{catch_unwind, AssertUnwindSafe};

mod buffer_writer;
mod parquet_writer;
mod schema;

use crate::parquet_writer::*;
use crate::schema::*;

// Convert a panic payload into a napi::Error so panics surface as JS exceptions
// instead of unwinding across the FFI boundary (which aborts the Node process).
// After a caught panic the writer is left in an inconsistent state; callers
// must discard it and not invoke further methods.
fn panic_to_error(payload: Box<dyn Any + Send>) -> napi::Error {
  let msg = if let Some(s) = payload.downcast_ref::<String>() {
    s.clone()
  } else if let Some(s) = payload.downcast_ref::<&str>() {
    (*s).to_string()
  } else {
    "parquet-writer panicked".to_string()
  };
  napi::Error::from_reason(format!("parquet-writer panic: {msg}"))
}

#[napi(js_name = "ParquetWriter")]
pub struct JsParquetWriter {
  parquet_writer: ParquetWriter,
}

#[napi]
impl JsParquetWriter {
  #[napi(constructor)]
  pub fn new(basic_schema: Vec<BasicSchemaProperty>) -> Result<Self> {
    let parquet_writer =
      catch_unwind(AssertUnwindSafe(|| ParquetWriter::new(basic_schema))).map_err(panic_to_error)?;
    Ok(JsParquetWriter { parquet_writer })
  }

  #[napi]
  pub fn add_rows(&mut self, env: Env, rows: Vec<Object<'_>>) -> Result<BufferSlice<'_>> {
    let writer = &mut self.parquet_writer;
    let data =
      catch_unwind(AssertUnwindSafe(|| writer.add_rows(rows))).map_err(panic_to_error)?;
    BufferSlice::from_data(&env, data)
  }

  #[napi]
  pub fn finish(&mut self, env: Env) -> Result<BufferSlice<'_>> {
    let writer = &mut self.parquet_writer;
    let data = catch_unwind(AssertUnwindSafe(|| writer.finish())).map_err(panic_to_error)?;
    BufferSlice::from_data(&env, data)
  }
}
