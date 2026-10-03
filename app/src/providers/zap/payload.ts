import { asRecord, nonEmptyString, type UnknownRecord } from '../utils';

export interface ZapIssuePayload {
  wrapper: UnknownRecord;
  issue: UnknownRecord;
}

export function zapIssuePayload(payload: unknown): ZapIssuePayload | null {
  const wrapper = asRecord(payload);
  if (!wrapper) return null;

  const response = asRecord(wrapper.response);
  const nestedIssue = asRecord(response?.issue);

  if (nestedIssue) return { wrapper, issue: nestedIssue };
  if (nonEmptyString(wrapper.id) || nonEmptyString(wrapper.remote_id)) {
    return { wrapper, issue: wrapper };
  }

  return null;
}
