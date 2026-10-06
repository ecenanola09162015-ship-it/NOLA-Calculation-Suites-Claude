# Contributing

Use short-lived branches and pull requests. A change is ready to merge only when linting, type checks, tests, and the relevant engineering verification cases pass.

## Branch naming

- `feature/<short-name>`
- `fix/<short-name>`
- `docs/<short-name>`
- `calc/<module>-<code-edition>`

## Engineering calculation changes

Every formula change must identify its source, clause, edition, units, assumptions, independent reviewer, benchmark inputs, expected outputs, tolerances, and affected reports. Numerical logic may not be merged solely because the interface works.
