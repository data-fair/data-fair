use napi::bindgen_prelude::*;
use parquet::basic::Compression;
use parquet::data_type::*;
use parquet::file::{
  properties::{WriterProperties, WriterVersion},
  writer::SerializedFileWriter,
};
use std::sync::Arc;

use crate::buffer_writer::*;
use crate::schema::*;

pub struct ParquetWriter {
  basic_schema: Vec<BasicSchemaProperty>,
  file_writer: SerializedFileWriter<BufferWriter>,
}

impl<'a> ParquetWriter {
  pub fn new(basic_schema: Vec<BasicSchemaProperty>) -> Self {
    let buffer_writer = BufferWriter::new();
    let schema = create_parquet_schema(&basic_schema);
    let file_writer_props = WriterProperties::builder()
      .set_compression(Compression::SNAPPY)
      .set_writer_version(WriterVersion::PARQUET_2_0)
      .set_key_value_metadata(Some(Vec::new()))
      .build();
    let file_writer =
      SerializedFileWriter::new(buffer_writer, Arc::new(schema), Arc::new(file_writer_props))
        .unwrap();
    ParquetWriter {
      basic_schema,
      file_writer,
    }
  }

  pub fn add_rows(&mut self, rows: Vec<Object>) -> Vec<u8> {
    let mut row_group_writer = self.file_writer.next_row_group().unwrap();
    for prop in &self.basic_schema {
      let mut serialized_column_writer = row_group_writer.next_column().unwrap().unwrap();
      if prop.typ == "boolean" {
        let column_writer = serialized_column_writer.typed::<BoolType>();
        let mut values = Vec::new();
        let mut definition_levels = Vec::new();
        for row in &rows {
          let value = row.get(prop.key.as_str()).unwrap();
          if value.is_none() {
            definition_levels.push(0);
          } else {
            let value = value.unwrap();
            values.push(value);
            definition_levels.push(1);
          }
        }
        if values.len() > 0 {
          column_writer
            .write_batch(&values, Some(&definition_levels), None)
            .unwrap();
        }
      } else if prop.typ == "integer" {
        let column_writer = serialized_column_writer.typed::<Int32Type>();
        let mut values = Vec::new();
        let mut definition_levels = Vec::new();
        for row in &rows {
          let value = row.get(prop.key.as_str()).unwrap();
          if value.is_none() {
            definition_levels.push(0);
          } else {
            let value = value.unwrap();
            values.push(value);
            definition_levels.push(1);
          }
        }
        if values.len() > 0 {
          column_writer
            .write_batch(&values, Some(&definition_levels), None)
            .unwrap();
        }
      } else if prop.typ == "number" {
        let column_writer = serialized_column_writer.typed::<DoubleType>();
        let mut values = Vec::new();
        let mut definition_levels = Vec::new();
        for row in &rows {
          let value = row.get(prop.key.as_str()).unwrap();
          if value.is_none() {
            definition_levels.push(0);
          } else {
            let value = value.unwrap();
            values.push(value);
            definition_levels.push(1);
          }
        }
        if values.len() > 0 {
          column_writer
            .write_batch(&values, Some(&definition_levels), None)
            .unwrap();
        }
      } else if prop.typ == "string" {
        if prop.format.as_deref() == Some("date") {
          let column_writer = serialized_column_writer.typed::<Int32Type>();
          let mut values = Vec::new();
          let mut definition_levels = Vec::new();
          for row in &rows {
            let value = row.get(prop.key.as_str()).unwrap();
            if value.is_none() {
              definition_levels.push(0);
            } else {
              let value = value.unwrap();
              values.push(value);
              definition_levels.push(1);
            }
          }
          if values.len() > 0 {
            column_writer
              .write_batch(&values, Some(&definition_levels), None)
              .unwrap();
          }
        } else if prop.format.as_deref() == Some("date-time") {
          let column_writer = serialized_column_writer.typed::<Int64Type>();
          let mut values = Vec::new();
          let mut definition_levels = Vec::new();
          for row in &rows {
            let value = row.get(prop.key.as_str()).unwrap();
            if value.is_none() {
              definition_levels.push(0);
            } else {
              let value = value.unwrap();
              values.push(value);
              definition_levels.push(1);
            }
          }
          if values.len() > 0 {
            column_writer
              .write_batch(&values, Some(&definition_levels), None)
              .unwrap();
          }
        } else {
          let column_writer = serialized_column_writer.typed::<ByteArrayType>();
          let mut values = Vec::new();
          let mut definition_levels = Vec::new();
          for row in &rows {
            let value_str: Option<String> = row.get(prop.key.as_str()).unwrap();
            if value_str.is_none() {
              definition_levels.push(0);
            } else {
              let value = ByteArray::from(value_str.unwrap().as_str());
              values.push(value);
              definition_levels.push(1);
            }
          }
          if values.len() > 0 {
            column_writer
              .write_batch(&values, Some(&definition_levels), None)
              .unwrap();
          }
        }
      } else {
        panic!(
          "unsupported type for parquet writer, {} / {}",
          prop.key, prop.typ
        )
      }

      serialized_column_writer.close().unwrap();
    }

    row_group_writer.close().unwrap();

    self.file_writer.inner_mut().consume()
  }

  pub fn finish(&mut self) -> Vec<u8> {
    self.file_writer.finish().unwrap();
    self.file_writer.inner_mut().consume()
  }
}
