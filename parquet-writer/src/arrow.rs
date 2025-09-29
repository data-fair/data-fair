use napi::bindgen_prelude::*;
use napi_derive::napi;
use arrow_schema::{Schema, SchemaBuilder};
use arrow_array::RecordBatch;

use std::{any::Any, sync::Arc};

#[napi(object)]
pub struct BasicSchemaProperty {
    pub key: String,
    pub typ: String,
    pub format: String,
    pub required: bool
}

// cf https://docs.rs/arrow-schema/56.2.0/arrow_schema/struct.Schema.html
pub fn create_arrow_schema (properties: & Vec<BasicSchemaProperty>) -> Schema {
    let mut schema_builder = SchemaBuilder::new();
    for prop in properties {
        let field = match prop.typ.as_str() {
            "number" => arrow_schema::Field::new(&prop.key, arrow_schema::DataType::Float64, !prop.required),
            "integer" => arrow_schema::Field::new(&prop.key, arrow_schema::DataType::Int64, !prop.required),
            "boolean" => arrow_schema::Field::new(&prop.key, arrow_schema::DataType::Boolean, !prop.required),
            "string" => {
                if prop.format == "date" {
                    arrow_schema::Field::new(&prop.key, arrow_schema::DataType::Date32, !prop.required)
                } else if prop.format == "date-time" {
                    arrow_schema::Field::new(&prop.key, arrow_schema::DataType::Timestamp(arrow_schema::TimeUnit::Millisecond, None), !prop.required)
                } else {
                    arrow_schema::Field::new(&prop.key, arrow_schema::DataType::Utf8, !prop.required)
                }
            }
            _ => arrow_schema::Field::new(&prop.key, arrow_schema::DataType::Null, !prop.required),
        };
        schema_builder.push(field);
    }
    schema_builder.finish()
}

// cf https://arrow.apache.org/rust/arrow_array/index.html#alternatives-to-chunkedarray-support
pub fn create_record_batch(rows: Vec<Object>, properties: Vec<BasicSchemaProperty>) -> RecordBatch {
  let mut arrays = Vec::new();
  for prop in properties {
    if prop.typ == "number" {
      let mut builder = arrow_array::Float64Array::builder(rows.len());
      for row in rows {
        let value = row.get::<f64>(prop.key.as_str()).unwrap();
        match value {
            value => builder.append_null(),
            Some(i) => builder.append_value(i),
        }
      }
      arrays.push((prop.key, Arc::new(builder.finish())));
    }
  }

  RecordBatch::try_from_iter(arrays).unwrap()
}