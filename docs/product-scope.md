# Product Scope

## Product statement

ÑOLA Calculation Suites provides traceable structural and geotechnical calculations through coordinated web, Windows desktop, iOS, and Android applications. A user must create an account with an email address or log in before accessing any application content.

## Approved first release scope

| Discipline                | Pilot module          | Initial purpose                                                                      |
| ------------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| Concrete                  | RC Column             | Short, non-slender rectangular column design with axial and biaxial demand inputs    |
| Steel                     | Steel Column          | Compression-member design with section, material, length, restraint, and load inputs |
| Loads                     | Seismic Loads         | Equivalent lateral force calculation with explicit code family and edition           |
| Foundation & Geotechnical | Soil Bearing Capacity | Allowable and ultimate bearing-pressure assessment; full settlement remains separate |

Slope Stability Analysis is a Phase 2 Foundation & Geotechnical module. Its staged scope will progress from unsupported slopes to supported and staged conditions.

## Platform behavior

- Web: responsive application deployed through Vercel.
- Desktop: Windows application packaged with Tauri 2 and distributed through signed releases.
- Mobile: iOS and Android application built with React Native and Expo.
- All platforms import the same calculation package and data schemas.
- Mobile phone screens prioritize guided input and result review; tablets and desktop can show denser workspaces.

## Out of scope for the foundation milestone

- Certified engineering calculations without approved benchmarks
- Custom password storage
- Full settlement calculation inside the Soil Bearing Capacity pilot
- Integration with ÑOLA CAD
- Licensing and payment enforcement
- Eurocode and Australian Standards implementations
