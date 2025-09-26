use neon::{object::Object, prelude::{Context, FunctionContext, Handle, JsBox, JsFunction, JsResult, ModuleContext, NeonResult}, types::JsArray};

use crate::parquet_exporter::ParquetExporter;
mod buffer_stream_writer;
mod schema;
mod parquet_exporter;

fn create_parquet_exporter(mut cx: FunctionContext) -> JsResult<JsBox<parquet_exporter::ParquetExporter>> {
    let dataset_schema = cx.argument::<JsArray>(0)?;
    let data_callback = cx.argument::<JsFunction>(1)?;
    let end_callback = cx.argument::<JsFunction>(2)?;
    
    let exporter = ParquetExporter::new(&mut cx, dataset_schema, data_callback, end_callback);
    Ok(cx.boxed(exporter))
}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("createParquetExporter", create_parquet_exporter)?;
    Ok(())
}