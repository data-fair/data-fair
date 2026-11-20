# Generates the parquet test fixtures: python3 tests/resources/datasets/parquet-fixtures.py (needs pyarrow)
import datetime
import math
import os
import pyarrow as pa
import pyarrow.parquet as pq

out_dir = os.path.dirname(os.path.abspath(__file__))
paris = datetime.timezone(datetime.timedelta(hours=1))

pq.write_table(pa.table({
  'code': pa.array(['01001', '02002', '75056']),
  'entier': pa.array([1, 2, 3], pa.int64()),
  'nombre': pa.array([1.0, 2.5, math.nan]),
  'actif': pa.array([True, False, None]),
  'jour': pa.array([datetime.date(2024, 1, 31), datetime.date(2024, 2, 1), None]),
  'horodatage': pa.array([datetime.datetime(2024, 1, 31, 10, 30, tzinfo=paris), None, datetime.datetime(2024, 7, 1, 8, 0, tzinfo=paris)], pa.timestamp('ms', tz='Europe/Paris')),
  'tags': pa.array([['a', 'b'], [], None], pa.list_(pa.string())),
  'objet': pa.array([{'x': 1, 'y': 'un'}, None, {'x': 3, 'y': 'trois'}]),
  'Libellé': pa.array(['premier', 'deuxième', None]),
}), os.path.join(out_dir, 'types.parquet'), compression='zstd')

# a list item containing the multi-valued separator
pq.write_table(pa.table({
  'tags': pa.array([['a', 'b;c']], pa.list_(pa.string())),
  'nombres': pa.array([[1, 2]], pa.list_(pa.int64())),
}), os.path.join(out_dir, 'list-separator.parquet'))
