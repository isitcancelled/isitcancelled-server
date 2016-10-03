# IsItCancelled API Spec

## Endpoints

* `GET /semesters`
  **Returns:**
  ```
  [
    {
        id: 64,
        name: "Herbstsemester 2015/2016"
        startDate: Date(07.08.2015),
        endDate: Date(24.02.2015)
    }
    ...
  ]
  ```

* `GET /semesters/:semesterId/weeks`
  **Returns:**
  ```

  ```

* `GET /semesters/:semesterId/t`

* `GET /semesters/:semesterId/classes`

* `GET /semesters/:semesterId/weeks/:weekId?class_id=:classId&slotted=bool`

* `GET /semesters/:semesterId/all?api_key=:key`