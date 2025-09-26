use neon::prelude::{FunctionContext, Handle, JsArray, JsObject, Object};
use parquet::{
    basic::{ LogicalType, Repetition, TimeUnit, Type as PhysicalType},
    format::{MilliSeconds}, schema::types::Type
};
use std::{sync::Arc};

pub struct BasicSchemaProperty {
    pub key: String,
    pub typ: String,
    pub format: String,
    pub required: bool
}

pub fn create_basic_schema(cx: &mut FunctionContext, data_fair_schema: Handle<JsArray>) -> Vec<BasicSchemaProperty> {
    let mut basic_schema = Vec::new();
    for i in 0..data_fair_schema.len(cx) {
        let item: Handle<JsObject> = data_fair_schema
          .get_value(cx, i).unwrap().downcast(cx).unwrap();
        let key: String = item.prop(cx, "key")
          .get().unwrap();
        let typ: String = item.prop(cx, "type")
          .get().unwrap();
        let format: String = item.prop(cx, "format")
          .get().unwrap_or_default();
        let required: bool = item.prop(cx, "x-required")
          .get().unwrap_or_default();

        basic_schema.push(BasicSchemaProperty {
            key: key.into(),
            typ: typ.into(),
            format: format.into(),
            required: required
        });
    }
    basic_schema
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
      if prop.format == "date" {
        physical_type = PhysicalType::INT32;
        logical_type = Some(LogicalType::Date);
      } else if prop.format == "date-time" {
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
