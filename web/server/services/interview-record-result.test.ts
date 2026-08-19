import assert from 'node:assert/strict'
import test from 'node:test'

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test'
const { interviewResultToApplicationStatus } = await import('./interview-record.service')

test('maps interview result to application status', () => {
  assert.equal(interviewResultToApplicationStatus('UNDECIDED', null), 'INTERVIEWING')
  assert.equal(interviewResultToApplicationStatus('PASSED', 'FINAL'), 'OFFERED')
  assert.equal(interviewResultToApplicationStatus('PASSED', 'HR'), 'OFFERED')
  assert.equal(interviewResultToApplicationStatus('PASSED', 'FIRST'), 'INTERVIEWING')
  assert.equal(interviewResultToApplicationStatus('PASSED', 'SECOND'), 'INTERVIEWING')
  assert.equal(interviewResultToApplicationStatus('PASSED', null), 'INTERVIEWING')
  assert.equal(interviewResultToApplicationStatus('FAILED', 'FIRST'), 'REJECTED')
  assert.equal(interviewResultToApplicationStatus('WITHDRAWN', null), 'WITHDRAWN')
})