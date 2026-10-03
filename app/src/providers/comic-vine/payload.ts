import { asRecord, nonEmptyString, type UnknownRecord } from '../utils';

export interface ComicVineIssuePayload {
  wrapper: UnknownRecord;
  issue: UnknownRecord;
}

export function comicVineIssuePayload(
  payload: unknown,
): ComicVineIssuePayload | null {
  const wrapper = asRecord(payload);
  if (!wrapper) return null;

  const issue = asRecord(wrapper.response) ?? asRecord(wrapper.results);
  if (!issue) return null;

  const id = nonEmptyString(issue.id) ?? nonEmptyString(wrapper.remote_id);
  return id ? { wrapper, issue } : null;
}

export function comicVineSyntheticId(value: unknown): {
  issueExternalId: string;
  coverIndex: number | null;
} | null {
  const externalId = nonEmptyString(value);
  if (!externalId) return null;

  const match = externalId.match(/^(4000-\d+)(?:-(\d+))?$/);
  if (!match) return { issueExternalId: externalId, coverIndex: null };

  return {
    issueExternalId: match[1],
    coverIndex: match[2] === undefined ? null : Number(match[2]),
  };
}
