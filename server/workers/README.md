# Workers logic

This document sums up all dataset statuses and the transition accross statuses performed by workers and API calls.

Compared to previous implementation the purpose is:
  - better readability of journal (more meaningful and less numerous events)
  - safer state transitions (less cases of incoherent state because we reduce intermediate writes)
  - better schema / data validation workflow
  - better management of code complexity relative to the complexity of the workflows
  - less infrastructure usage and less latency

  - workers, events and tasks are decoupled, meaning:
    - one worker can run multiple intermediate tasks with separate loading bars in the activity tab
    - events are not simply start and end of a worker's task, they are emitted by workers as needed to create the most useful journal
  - less statuses, less worker types, less complexity hopefully
  - less worker instantiations (means less processes, less latency, faster tests)
  - more complex main dataset worker but the complexity is abstracted into high level functions instead of small workers
  - the most used journal event is the "finalize-end" that is used to detect that a dataset was fully updated, we keep it, other events will be changed

## States

### "created"

All datasets are in this state at first.

### "updated"

File datasets are in this state right after upload (or download in the case of remote file datasets). Rest datasets are in this state after a request performed some changes on the mongodb collection.

All datasets are in this state after an impactful metadata update (impactful means that at least some action is required by a worker).

This state is accompanied by a property "currentUpdate" that stores information useful for the worker to perform the right tasks (which parts of the metadata were patched, if there was breaking schema changes, etc).

When a dataset is in this state there can be some cases where there are some discrepancies (a rest dataset's index not being up to date with the database, an extension declared but not yet executed, etc).But we try to reduce those as much as possible.

### "finalized"

Default state of a dataset that was entirely processed.

### "error"

When a worker fails, the dataset is moved into "error" state. Also an error object is stored containing the error message and the status of the dataset before worker failure (so that retries can be performed).

## Workers

A single worker "dataset-manager" performs all the tasks related to a dataset state changes.

The workers that perform secondary tasks not related to the main state of the dataset are preserved (catalog publications, remote file auto updates, etc).
