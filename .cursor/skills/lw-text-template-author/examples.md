# lw-text Authoring Examples

## Example 1: Create invoice from schema

**User:** “Create a B2B invoice PDF template for schema DATA.”

**Agent steps:**

1. Read `schemas/DATA.schema.json`.
2. Create `fixtures/DATA.invoice-b2b.json` with realistic sample (no real PII).
3. Create `templates/invoice-b2b.lw` with header, line repeater, tax section, locked footer block.
4. Run `lw validate` if available.

## Example 2: Add conditional section

**User:** “Show VAT paragraph only for EU customers.”

```html
<section id="vat-note" if="DATA.customer.region == 'EU'">
  <p>VAT ID: {{ DATA.customer.vatId }}</p>
</section>
```

Add `customer.region` and `customer.vatId` to schema if missing; update fixture.

## Example 3: Refused edit on locked zone

**User:** “Rewrite the legal disclaimer.”

**Agent:** Disclaimer is in `ai-editable="false"` section → respond: cannot auto-edit; offer new **optional** appendix block or ask legal owner to update `@acme/legal-footer` package.

## Example 4: Localize body only

**User:** “German version of letter body, keep layout.”

Create `blocks/letter-body.de.lw`; reference from main template:

```html
<section id="body" data-block="blocks/letter-body.de" />
```

Do not duplicate locked header/footer.

## Example 5: Copilot chat prompt (user copy-paste)

```
Using lw-text conventions (DATA datasource, .lw files):
1. Read schemas/DATA.schema.json
2. Create templates/payment-reminder.lw with reminder level from DATA.reminder.level
3. Add fixtures/DATA.payment-reminder.json
4. Validate with lw validate
```

## Example 6: Minimal fixture

```json
{
  "locale": "en-US",
  "policyholder": { "salutation": "Ms.", "lastName": "Example" },
  "claim": { "status": "approved", "summary": "Your claim has been approved." },
  "lineItems": []
}
```
