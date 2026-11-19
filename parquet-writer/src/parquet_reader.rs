use arrow::array::{Array, ArrayRef, AsArray, RecordBatch};
use arrow::datatypes::{DataType, Field, Float16Type, Float32Type, Float64Type, Schema};
use arrow::json::LineDelimitedWriter;
use arrow::util::display::{ArrayFormatter, FormatOptions};
use napi_derive::napi;
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use std::fs::File;
use std::io::Write;
use std::sync::Arc;

// separator of the multi-valued columns produced from lists of scalar values
const LIST_SEPARATOR: &str = ";";

// error message prefix of a conversion stopped by max_bytes, matched on the JS side
pub const SIZE_LIMIT_ERROR: &str = "csv output exceeds the size limit";

struct CountingWriter<W: Write> {
  inner: W,
  count: u64,
}

impl<W: Write> Write for CountingWriter<W> {
  fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
    let n = self.inner.write(buf)?;
    self.count += n as u64;
    Ok(n)
  }
  fn flush(&mut self) -> std::io::Result<()> {
    self.inner.flush()
  }
}

#[napi(object)]
pub struct ParquetField {
  pub name: String,
  #[napi(js_name = "type")]
  pub typ: String,
  pub format: Option<String>,
  pub separator: Option<String>,
}

#[napi(object)]
pub struct ParquetToCsvResult {
  pub num_rows: i64,
  pub fields: Vec<ParquetField>,
}

enum ColumnKind {
  Scalar,
  // list of scalar values, joined with LIST_SEPARATOR
  ScalarList,
  // any other nested value (struct, map, list of nested values), serialized as JSON
  Json,
}

fn is_scalar(data_type: &DataType) -> bool {
  match data_type {
    DataType::Dictionary(_, value_type) => is_scalar(value_type),
    DataType::List(_)
    | DataType::LargeList(_)
    | DataType::ListView(_)
    | DataType::LargeListView(_)
    | DataType::FixedSizeList(_, _)
    | DataType::Struct(_)
    | DataType::Map(_, _)
    | DataType::Union(_, _)
    | DataType::RunEndEncoded(_, _) => false,
    _ => true,
  }
}

fn list_item_type(data_type: &DataType) -> Option<&DataType> {
  match data_type {
    DataType::List(f) | DataType::LargeList(f) | DataType::FixedSizeList(f, _) => {
      Some(f.data_type())
    }
    _ => None,
  }
}

fn column_kind(data_type: &DataType) -> ColumnKind {
  if is_scalar(data_type) {
    return ColumnKind::Scalar;
  }
  match list_item_type(data_type) {
    Some(item_type) if is_scalar(item_type) => ColumnKind::ScalarList,
    _ => ColumnKind::Json,
  }
}

// data-fair type and format of a scalar arrow type
fn scalar_type(data_type: &DataType) -> (&'static str, Option<&'static str>) {
  match data_type {
    DataType::Dictionary(_, value_type) => scalar_type(value_type),
    DataType::Boolean => ("boolean", None),
    DataType::Int8
    | DataType::Int16
    | DataType::Int32
    | DataType::Int64
    | DataType::UInt8
    | DataType::UInt16
    | DataType::UInt32
    | DataType::UInt64 => ("integer", None),
    DataType::Float16
    | DataType::Float32
    | DataType::Float64
    | DataType::Decimal32(_, _)
    | DataType::Decimal64(_, _)
    | DataType::Decimal128(_, _)
    | DataType::Decimal256(_, _) => ("number", None),
    DataType::Date32 | DataType::Date64 => ("string", Some("date")),
    DataType::Timestamp(_, _) => ("string", Some("date-time")),
    _ => ("string", None),
  }
}

// a list column whose values contain the separator stays a plain string column
fn data_fair_field(field: &Field, separator_collision: bool) -> ParquetField {
  let (typ, format, separator) = match column_kind(field.data_type()) {
    ColumnKind::ScalarList if separator_collision => ("string", None, None),
    ColumnKind::Scalar => {
      let (typ, format) = scalar_type(field.data_type());
      (typ, format, None)
    }
    ColumnKind::ScalarList => {
      let (typ, format) = scalar_type(list_item_type(field.data_type()).unwrap());
      (typ, format, Some(LIST_SEPARATOR.to_string()))
    }
    ColumnKind::Json => ("string", None, None),
  };
  ParquetField {
    name: field.name().clone(),
    typ: typ.to_string(),
    format: format.map(|f| f.to_string()),
    separator,
  }
}

fn is_non_finite_float(array: &dyn Array, i: usize) -> bool {
  match array.data_type() {
    DataType::Float16 => !array.as_primitive::<Float16Type>().value(i).is_finite(),
    DataType::Float32 => !array.as_primitive::<Float32Type>().value(i).is_finite(),
    DataType::Float64 => !array.as_primitive::<Float64Type>().value(i).is_finite(),
    _ => false,
  }
}

// string value of a scalar cell, None for null, NaN and infinite values
fn scalar_value(
  array: &dyn Array,
  formatter: &ArrayFormatter,
  i: usize,
) -> Result<Option<String>, String> {
  if array.is_null(i) || is_non_finite_float(array, i) {
    return Ok(None);
  }
  if let DataType::Boolean = array.data_type() {
    return Ok(Some(
      if array.as_boolean().value(i) {
        "1"
      } else {
        "0"
      }
      .to_string(),
    ));
  }
  formatter
    .value(i)
    .try_to_string()
    .map(Some)
    .map_err(|e| e.to_string())
}

fn list_values(array: &dyn Array, i: usize) -> Option<ArrayRef> {
  if array.is_null(i) {
    return None;
  }
  match array.data_type() {
    DataType::List(_) => Some(array.as_list::<i32>().value(i)),
    DataType::LargeList(_) => Some(array.as_list::<i64>().value(i)),
    DataType::FixedSizeList(_, _) => Some(array.as_fixed_size_list().value(i)),
    _ => None,
  }
}

// one JSON value per row for a nested column, using arrow's own JSON encoder
fn json_values(field: &Field, column: &ArrayRef) -> Result<Vec<Option<String>>, String> {
  let schema = Arc::new(Schema::new(vec![field.clone()]));
  let batch = RecordBatch::try_new(schema, vec![column.clone()]).map_err(|e| e.to_string())?;
  let mut writer = LineDelimitedWriter::new(Vec::new());
  writer.write(&batch).map_err(|e| e.to_string())?;
  writer.finish().map_err(|e| e.to_string())?;
  let buffer = writer.into_inner();
  let mut values = Vec::with_capacity(column.len());
  for line in buffer.split(|b| *b == b'\n').take(column.len()) {
    let row: serde_json::Map<String, serde_json::Value> =
      serde_json::from_slice(line).map_err(|e| e.to_string())?;
    values.push(match row.get(field.name()) {
      None | Some(serde_json::Value::Null) => None,
      Some(value) => Some(value.to_string()),
    });
  }
  Ok(values)
}

// max_bytes bounds the csv output: a few KB of parquet can declare billions of rows
pub fn parquet_to_csv(
  input_path: &str,
  output_path: &str,
  max_bytes: Option<i64>,
) -> Result<ParquetToCsvResult, String> {
  let file = File::open(input_path).map_err(|e| e.to_string())?;
  let builder = ParquetRecordBatchReaderBuilder::try_new(file).map_err(|e| e.to_string())?;
  let schema = builder.schema().clone();
  let reader = builder
    .with_batch_size(8192)
    .build()
    .map_err(|e| e.to_string())?;

  let kinds: Vec<ColumnKind> = schema
    .fields()
    .iter()
    .map(|f| column_kind(f.data_type()))
    .collect();
  let format_options = FormatOptions::default().with_display_error(true);

  let mut separator_collisions = vec![false; schema.fields().len()];
  let mut output = CountingWriter {
    inner: File::create(output_path).map_err(|e| e.to_string())?,
    count: 0,
  };
  // same BOM as the other normalized csv files
  output
    .write_all(b"\xEF\xBB\xBF")
    .map_err(|e| e.to_string())?;
  let mut csv_writer = csv::WriterBuilder::new()
    .quote_style(csv::QuoteStyle::Necessary)
    .from_writer(output);
  csv_writer
    .write_record(schema.fields().iter().map(|f| f.name().as_str()))
    .map_err(|e| e.to_string())?;

  let mut num_rows: i64 = 0;
  for batch in reader {
    let batch = batch.map_err(|e| e.to_string())?;
    let mut columns: Vec<Vec<Option<String>>> = Vec::with_capacity(batch.num_columns());
    for (c, column) in batch.columns().iter().enumerate() {
      let field = schema.field(c);
      let values = match kinds[c] {
        ColumnKind::Scalar => {
          let formatter =
            ArrayFormatter::try_new(column.as_ref(), &format_options).map_err(|e| e.to_string())?;
          (0..column.len())
            .map(|i| scalar_value(column.as_ref(), &formatter, i))
            .collect::<Result<Vec<_>, _>>()?
        }
        ColumnKind::ScalarList => {
          let mut values = Vec::with_capacity(column.len());
          for i in 0..column.len() {
            values.push(match list_values(column.as_ref(), i) {
              None => None,
              Some(items) => {
                let formatter = ArrayFormatter::try_new(items.as_ref(), &format_options)
                  .map_err(|e| e.to_string())?;
                let mut parts = Vec::with_capacity(items.len());
                for j in 0..items.len() {
                  if let Some(v) = scalar_value(items.as_ref(), &formatter, j)? {
                    if v.contains(LIST_SEPARATOR) {
                      separator_collisions[c] = true;
                    }
                    parts.push(v);
                  }
                }
                if parts.is_empty() {
                  None
                } else {
                  Some(parts.join(LIST_SEPARATOR))
                }
              }
            });
          }
          values
        }
        ColumnKind::Json => json_values(field, column)?,
      };
      columns.push(values);
    }
    for i in 0..batch.num_rows() {
      csv_writer
        .write_record(
          columns
            .iter()
            .map(|values| values[i].as_deref().unwrap_or("")),
        )
        .map_err(|e| e.to_string())?;
    }
    num_rows += batch.num_rows() as i64;
    if let Some(max) = max_bytes {
      csv_writer.flush().map_err(|e| e.to_string())?;
      if csv_writer.get_ref().count > max as u64 {
        return Err(format!("{SIZE_LIMIT_ERROR} ({max} bytes)"));
      }
    }
  }
  csv_writer.flush().map_err(|e| e.to_string())?;

  Ok(ParquetToCsvResult {
    num_rows,
    fields: schema
      .fields()
      .iter()
      .enumerate()
      .map(|(c, f)| data_fair_field(f, separator_collisions[c]))
      .collect(),
  })
}
