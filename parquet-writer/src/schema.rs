use napi_derive::napi;
use parquet::{
    basic::{ LogicalType, Repetition, TimeUnit, Type as PhysicalType},
    format::{MilliSeconds}, schema::types::Type
};
use std::{sync::Arc};

#[napi(object)]
pub struct BasicSchemaProperty {
    pub key: String,
    #[napi(js_name = "type")]
    pub typ: String,
    pub format: Option<String>,
    #[napi(js_name = "x-required")]
    pub required: bool
}

pub fn create_parquet_schema (properties: & Vec<BasicSchemaProperty>) -> Type {
  let mut fields: Vec<Arc<Type>> = vec![];
  for prop in properties {
    let mut physical_type: PhysicalType = PhysicalType::BYTE_ARRAY;
    let mut logical_type: Option<LogicalType> = None;
    if prop.typ == "number" {
      physical_type = PhysicalType::DOUBLE;
    }
    if prop.typ == "integer" {
      physical_type = PhysicalType::INT64;
    }
    if prop.typ == "boolean" {
      physical_type = PhysicalType::BOOLEAN;
    }
    if prop.typ == "string" {
      if prop.format.as_deref() == Some("date") {
        physical_type = PhysicalType::INT32;
        logical_type = Some(LogicalType::Date);
      } else if prop.format.as_deref() == Some("date-time") {
        physical_type = PhysicalType::INT64;
        logical_type = Some(LogicalType::Timestamp { is_adjusted_to_u_t_c: false, unit: TimeUnit::MILLIS(MilliSeconds::default()) })
      } else {
        logical_type = Some(LogicalType::String);
      }
    }

    let field: Type = Type::primitive_type_builder(&prop.key, physical_type)
      .with_logical_type(logical_type)
      .with_repetition(if prop.required { Repetition::REQUIRED } else { Repetition::OPTIONAL })
      .build()
      .unwrap();

    
    fields.push(Arc::new(field));
  }

  let schema = Type::group_type_builder("schema")
    .with_fields(fields)
    .build()
    .unwrap();
  
  schema
}
