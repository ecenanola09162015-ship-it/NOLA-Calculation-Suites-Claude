# Calculation Verification Policy

Structural and geotechnical software must be treated as safety-critical. A module may move from `verification-required` to `verified` only after all gates below are complete.

## Required evidence

1. Exact code family, standard number, edition, clause, equation, and commentary source.
2. Units and sign conventions for every input and output.
3. Independent hand calculation or approved spreadsheet benchmark.
4. Boundary cases, invalid inputs, and expected warnings.
5. Comparison against an independent calculation or trusted software where appropriate.
6. Numerical tolerance justified for the equation and unit scale.
7. Independent engineering review and dated approval.
8. Regression tests committed with the calculation code.

## Release labels

- `interface-only`: UI/schema exists; no numerical result may be used.
- `verification-required`: algorithm exists but has not passed every gate.
- `verified`: approved for the stated code edition and scope.
- `deprecated`: retained only to open historical projects.

## Initial standard families

American/international standards and NSCP are first. The exact design-code edition must be selected and displayed by each calculation. Eurocode and Australian Standards are later, separate implementations with independent benchmarks.
