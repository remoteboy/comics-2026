import { parseCopyGrade } from '@/features/collection/copy-form';
import { metadataFromForm } from '@/features/collection/metadata-edit';
import { parsePurchaseDate } from '@/features/collection/purchase-details';
import { formInteger, formText } from '@/features/collection/write-form';
import type { IntakeInput } from './save';
export function intakeFromForm(data: FormData): IntakeInput {
  const optional = (name: string) => formText(data, name);
  const cents = (name: string) => {
    const value = optional(name);
    if (!value) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(value))
      throw new Error(
        'Enter non-negative prices with up to two decimal places.',
      );
    const [dollars, fraction = ''] = value.split('.');
    const result = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(result))
      throw new Error('That price is too large.');
    return result;
  };
  const localSeries = optional('localSeriesId'),
    year = optional('titleYear'),
    box = optional('boxId'),
    lookupId = optional('lookupId');
  return {
    requestId: formText(data, 'requestId'),
    lookupId: lookupId || null,
    coverId: optional('coverId') || null,
    localSeriesId: localSeries ? formInteger(data, 'localSeriesId', 1) : null,
    titleName: formText(data, 'titleName'),
    titleYear: year ? formInteger(data, 'titleYear', 1800) : null,
    titleStatus: formText(data, 'titleStatus') as IntakeInput['titleStatus'],
    number: formText(data, 'number'),
    issueType: formText(data, 'issueType') as IntakeInput['issueType'],
    gradeTenths: parseCopyGrade(data.get('grade')),
    quantity: formInteger(data, 'quantity', 1),
    boxId: box ? formInteger(data, 'boxId', 1) : null,
    purchasePriceCents: cents('purchasePrice'),
    purchaseDate: parsePurchaseDate(formText(data, 'purchaseDate')),
    valueMode: formText(data, 'valueMode') as IntakeInput['valueMode'],
    manualValueCents:
      formText(data, 'valueMode') === 'manual' ? cents('manualValue') : null,
    manualMetadata: lookupId ? null : metadataFromForm(data, 1),
  };
}
export function nextIssueNumber(number: string): string {
  if (!/^\d+$/.test(number)) return '';
  const numeric = Number(number);
  return Number.isSafeInteger(numeric) && numeric < Number.MAX_SAFE_INTEGER
    ? String(numeric + 1)
    : '';
}
