# Domain Glossary

## Entry
A single financial transaction. One row in the INCOMING/OUTGOING sheet. Fields: date, tag, main category (formula-resolved), description, direction, amount, entry ID. The unit of all reads and writes via the GAS API.

## Category
One of seven top-level budget buckets: **HOUSING, FOOD, TRANSIT, HEALTH, FINANCE, LIFESTYLE, MISC**. Always written in ALL CAPS. A Category is the coarsest grouping; Budgets are computed per Category.

## Subcategory
A named expense type that belongs to exactly one Category (e.g., `Dining → FOOD`, `Uniform → MISC`). Written in Title Case. Defined in the Categories sheet. New subcategories can be added there at any time; formulas update automatically.

Default subcategories by category:
- **HOUSING**: Rent, Utilities, Maintenance
- **FOOD**: Groceries, Dining
- **TRANSIT**: Commute Fare, Auto Maintenance, Fuel, Parking
- **HEALTH**: Consultation Fee, Pharmacy, Fitness, Insurance
- **FINANCE**: Tax, Debt, Investment, Savings
- **LIFESTYLE**: Leisure, Entertainment, Subscription, Grooming, Clothing, Gifts
- **MISC**: Career, Uniform, Tools

## Tag
The value in column C of INCOMING/OUTGOING. Tag is **polymorphic based on Direction**:
- On an **Incoming** Entry: Tag is a Category (e.g., `HOUSING`)
- On an **Outgoing** Entry: Tag is a Subcategory (e.g., `Dining`)

A Category-level Tag is never valid on an Outgoing Entry; a Subcategory-level Tag is never valid on an Incoming Entry.

## Direction
Whether an Entry is **Incoming** (`I`) or **Outgoing** (`O`). Stored in column F of INCOMING/OUTGOING. Determines the valid domain of Tag.

## Entry ID
A stable, auto-incrementing integer stored in column H of INCOMING/OUTGOING. Written by GAS when the row is first created; never changes. Used to identify a specific Entry for edit and delete operations. Values are never reused after deletion.

## Main Category
Column D of INCOMING/OUTGOING. A VLOOKUP formula that resolves any Tag (Category or Subcategory) to its parent Category. Formula-driven; GAS never writes to it. Used by MASTER sheet SUMIF formulas to aggregate Outgoing Entries by Category.

## Budget
The net balance for a Category. Computed as: sum of all Incoming Entries whose Tag equals that Category, minus sum of all Outgoing Entries whose Main Category resolves to it. Rolling all-time (no period resets). A Budget can go negative.

## ON HAND
The sum of all Category Budgets. Represents total money currently available across all categories. Displayed in the MASTER sheet. Derived entirely from spreadsheet formulas; GAS never writes to it.

## Sheets

### INCOMING/OUTGOING sheet
The single transaction log. One row per Entry. Column layout:
`B=DATE | C=TAG | D=[VLOOKUP] MAIN CATEGORY | E=DESCRIPTION | F=I/O | G=AMOUNT | H=ENTRY ID`

### MASTER sheet
A single summary row. Shows ON HAND plus the Budget for each Category. Entirely formula-driven; GAS only reads it, never writes to it.

### Categories sheet
The Subcategory-to-Category mapping table. Column B = Subcategory name, Column C = parent Category (merged cell spanning all subcategories of that Category). Adding a subcategory here automatically propagates to VLOOKUP formulas in INCOMING/OUTGOING.
