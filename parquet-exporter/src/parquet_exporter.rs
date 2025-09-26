use neon::prelude::{FunctionContext, Object, JsFunction, JsArray, JsObject, Handle, Root, Finalize};
use parquet::data_type::{DoubleType, Int64Type};
use parquet::{data_type::BoolType, file::{
  properties::WriterProperties,
  writer::SerializedFileWriter
}};
use crate::{buffer_stream_writer::BufferStreamWriter, schema::BasicSchemaProperty};
use crate::schema::{create_basic_schema, create_parquet_schema};
use std::sync::Arc;

pub struct ParquetExporter {
    // buffer_stream_writer: &'cx BufferStreamWriter<'cx>,
    basic_schema: Vec<BasicSchemaProperty>,
    file_writer: SerializedFileWriter<BufferStreamWriter>
}

impl ParquetExporter  {
    pub fn new(cx: &mut FunctionContext, dataset_schema: Handle<JsArray>, data_callback: Root<JsFunction>, end_callback: Root<JsFunction>) -> Self {
        let basic_schema = create_basic_schema(cx, dataset_schema);
        let buffer_stream_writer = BufferStreamWriter::new(cx, data_callback, end_callback);
        let schema = create_parquet_schema(&basic_schema);
        let file_writer_props = Arc::new(WriterProperties::builder().build());
        let file_writer = SerializedFileWriter::new(buffer_stream_writer, Arc::new(schema), file_writer_props).unwrap();
        ParquetExporter {
            basic_schema,
            file_writer
        }
    }

    pub fn add_rows(&mut self, cx: &mut FunctionContext, js_array: JsArray) {
        let mut row_group_writer = self.file_writer.next_row_group().unwrap();
        for prop in &self.basic_schema {
            let mut serialized_column_writer = row_group_writer.next_column().unwrap().unwrap();
            if prop.typ == "boolean" {
                let column_writer = serialized_column_writer.typed::<BoolType>();
                
                let mut values = Vec::new();
                for i in 0..js_array.len(cx) {
                    let item: Handle<JsObject> = js_array.get_value(cx, i).unwrap().downcast(cx).unwrap();
                    let value = item.prop(cx, prop.key.as_str())
                        .get().unwrap();
                    values.push(value);
                }
                column_writer.write_batch(&values, None, None);
            }

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
        
            serialized_column_writer.close();
        }

        row_group_writer.close();
    }

    fn finish(&mut self) {
        self.file_writer.finish();
    }
}

// The `Finalize` trait optionally provides a hook for executing code when the value
// is garbage collected.
impl Finalize for ParquetExporter {}