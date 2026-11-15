import test from 'node:test';
import assert from 'node:assert/strict';
import { getPasswordChecks, getPasswordScore, getPasswordStrengthLevel } from './passwordRules';

test('empty password is weak with no checks met', () => {
  assert.equal(getPasswordScore(''), 0);
  assert.equal(getPasswordStrengthLevel(''), 'weak');
});

test('score counts each satisfied rule', () => {
  assert.equal(getPasswordScore('abcdefgh'), 1);
  assert.equal(getPasswordScore('Abcdefgh'), 2);
  assert.equal(getPasswordScore('Abcdefg1'), 3);
  assert.equal(getPasswordScore('Abcdef1!'), 4);
});

test('strength buckets', () => {
  assert.equal(getPasswordStrengthLevel('abcdefgh'), 'weak');
  assert.equal(getPasswordStrengthLevel('Abcdefg1'), 'medium');
  assert.equal(getPasswordStrengthLevel('Abcdef1!'), 'strong');
});

test('checks flag the missing rules', () => {
  const met = getPasswordChecks('abc').map((c) => c.met);
  assert.deepEqual(met, [false, false, false, false]);
});
