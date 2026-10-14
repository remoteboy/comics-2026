import { normalizeRole } from '@/providers/utils';
import type { MetadataSuggestions } from './metadata-lookup';

export function initMetadataSuggestions(
  form: HTMLFormElement | null,
  addCredit: (credit: { name: string; role: string | null }) => void,
) {
  const panel = form?.querySelector<HTMLElement>('[data-metadata-lookup]');
  if (!form || !panel) return;
  const message = panel.querySelector<HTMLElement>('[data-metadata-message]')!;
  const notesPanel = panel.querySelector<HTMLElement>('[data-provider-notes]')!;
  const notesPreview = panel.querySelector<HTMLTextAreaElement>(
    '[data-provider-notes-text]',
  )!;
  const notes = form.querySelector<HTMLTextAreaElement>('[name="details"]')!;
  const useNotes = panel.querySelector<HTMLButtonElement>(
    '[data-use-provider-notes]',
  )!;
  const buttons = [
    ...panel.querySelectorAll<HTMLButtonElement>('[data-metadata-source]'),
  ];
  const updateNotesButton = () => {
    useNotes.textContent = notes.value.trim()
      ? 'Replace my notes with these'
      : 'Use these notes';
  };
  notes.addEventListener('input', updateNotesButton);
  useNotes.addEventListener('click', () => {
    notes.value = notesPreview.value;
    notes.dispatchEvent(new Event('input', { bubbles: true }));
    notes.focus();
    message.textContent =
      'Provider notes copied into Comic notes. Review and save comic details to apply.';
  });
  for (const button of buttons)
    button.addEventListener('click', async () => {
      buttons.forEach((item) => {
        item.disabled = true;
      });
      message.textContent = 'Fetching details… Your current entries are kept.';
      notesPanel.hidden = true;
      const params = new URLSearchParams({
        source: button.dataset.metadataSource!,
        expectedVersion: (
          form.elements.namedItem('expectedVersion') as HTMLInputElement
        ).value,
      });
      try {
        const response = await fetch(panel.dataset.endpoint!, {
          method: 'POST',
          body: params,
          headers: { Accept: 'application/json' },
        });
        const result = (await response.json()) as MetadataSuggestions & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            result.error ??
              'Details could not be fetched. Your edits are unchanged.',
          );
        let fields = 0;
        for (const key of [
          'storyTitle',
          'firstAppearanceOf',
          'publisherName',
          'coverPrice',
        ] as const) {
          const input = form.elements.namedItem(key) as HTMLInputElement;
          const value =
            key === 'coverPrice'
              ? result.coverPriceCents === null
                ? null
                : (result.coverPriceCents / 100).toFixed(2)
              : result[key];
          if (!input.value.trim() && value !== null) {
            input.value = value;
            fields++;
          }
        }
        const key = (name: string, role: string | null) =>
          `${name.trim().toLocaleLowerCase()}\u0000${normalizeRole(role ?? '')}`;
        const existing = new Set(
          [...form.querySelectorAll<HTMLElement>('[data-credit-row]')].map(
            (row) =>
              key(
                row.querySelector<HTMLInputElement>('[name="creatorName"]')!
                  .value,
                row.querySelector<HTMLSelectElement>('[name="creatorRole"]')!
                  .value,
              ),
          ),
        );
        let added = 0;
        const active = document.activeElement as HTMLElement | null;
        for (const credit of result.credits) {
          const identity = key(credit.name, credit.role);
          if (!existing.has(identity)) {
            const rowCount =
              form.querySelectorAll<HTMLElement>('[data-credit-row]').length;
            if (rowCount >= 100) break;
            addCredit(credit);
            existing.add(identity);
            added++;
          }
        }
        active?.focus();
        notesPreview.value = result.details ?? '';
        notesPanel.hidden = !result.details;
        updateNotesButton();
        message.textContent = `${fields} empty field${fields === 1 ? '' : 's'} filled; ${added} creator credit${added === 1 ? '' : 's'} added. ${result.notice} Review and save to apply.`;
      } catch (cause) {
        message.textContent =
          cause instanceof Error
            ? cause.message
            : 'Details could not be fetched. Your edits are unchanged.';
      } finally {
        buttons.forEach((item) => {
          item.disabled = form.dataset.conflict === 'true';
        });
      }
    });
  if (form.dataset.conflict === 'true')
    buttons.forEach((button) => {
      button.disabled = true;
    });
}
