use napi::bindgen_prelude::*;
use parquet::basic::Compression;
use parquet::file::{properties::WriterProperties, writer::SerializedFileWriter};
use parquet::data_type::*;
// use parquet::arrow::arrow_writer::*;
use std::sync::Arc;

use crate::buffer_writer::*;
// use crate::arrow::*;
use crate::schema::*;

pub struct ParquetWriter {
  basic_schema: Vec<BasicSchemaProperty>,
  file_writer: SerializedFileWriter<BufferWriter>
  // writer: ArrowWriter<&'a mut Vec<u8>>,
}

impl<'a> ParquetWriter {
  pub fn new(basic_schema: Vec<BasicSchemaProperty>, buffer: Buffer) -> Self {
    let buffer_writer = BufferWriter::new(buffer);
    let schema = create_parquet_schema(&basic_schema);
    let file_writer_props = WriterProperties::builder()
      .set_compression(Compression::SNAPPY)
      .build();
    let file_writer = SerializedFileWriter::new(buffer_writer, Arc::new(schema), Arc::new(file_writer_props)).unwrap();
    /*
    let schema = Arc::new(create_arrow_schema(&basic_schema));
    let props = WriterProperties::builder()
     .set_compression(Compression::SNAPPY)
     .build();
    let writer = ArrowWriter::try_new(buffer, schema, Some(props)).unwrap();
    */
    ParquetWriter {
      basic_schema,
      file_writer,
    }
  }

  pub fn add_rows(&mut self, rows: Vec<Object>) {
      // let batch = create_record_batch(&self.basic_schema, rows)?;
      // self.writer.write(&batch).unwrap();
      // Ok(())
      println!("add rows ?");

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
                    column_writer.write_batch(&values, Some(&definition_levels), None).unwrap();
                }
            } else if prop.typ == "integer" {
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
                    column_writer.write_batch(&values, Some(&definition_levels), None).unwrap();
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
                    column_writer.write_batch(&values, Some(&definition_levels), None).unwrap();
                }
            } else if prop.typ == "string" {
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
                    column_writer.write_batch(&values, Some(&definition_levels), None).unwrap();
                }
            } else {
                panic!("unsupported type for parquet writer, {} / {}", prop.key, prop.typ)
            }

            /*
            if prop.typ == "integer" {
                let column_writer = serialized_column_writer.typed::<Int64Type>();
                
                let mut values = Vec::new();
                for i in 0..js_array.len(cx) {
                    let item: Handle<JsObject> = js_array.get_value(cx, i).unwrap().downcast(cx).unwrap();
                    let value: f64 = item.prop(cx, prop.key.as_str())
                        .get().unwrap();
                    let int_value = value as i64;
                    values.push(int_value);
                }
                column_writer.write_batch(&values, None, None);
            }

            if prop.typ == "number" {
                let column_writer = serialized_column_writer.typed::<DoubleType>();
                
                let mut values = Vec::new();
                for i in 0..js_array.len(cx) {
                    let item: Handle<JsObject> = js_array.get_value(cx, i).unwrap().downcast(cx).unwrap();
                    let value = item.prop(cx, prop.key.as_str())
                        .get().unwrap();
                    values.push(value);
                }
                column_writer.write_batch(&values, None, None);
            }
            */
        
            serialized_column_writer.close().unwrap();
        }

        row_group_writer.close().unwrap();

        println!("added rows");
  }

  pub fn finish(&mut self) {
    println!("finish ?");
    // self.writer.finish().unwrap();
    self.file_writer.finish().unwrap();
    println!("finished");
  }
}
