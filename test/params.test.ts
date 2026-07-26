import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveParams } from '../src/server/params';

test('positional params pass through unchanged', () => {
    assert.deepEqual(resolveParams('SELECT $1', [42]), { text: 'SELECT $1', values: [42] });
});

test('named params resolve to positional placeholders', () => {
    assert.deepEqual(resolveParams('SELECT * FROM t WHERE name = :name', { name: 'alice' }), {
        text: 'SELECT * FROM t WHERE name = $1',
        values: ['alice'],
    });
});

test('repeated named param reuses the same index', () => {
    assert.deepEqual(resolveParams(':a + :a + :b', { a: 1, b: 2 }), {
        text: '$1 + $1 + $2',
        values: [1, 2],
    });
});

test('type casts are not mistaken for named params', () => {
    assert.deepEqual(resolveParams('SELECT created_at::text FROM t WHERE id = :id', { id: 5 }), {
        text: 'SELECT created_at::text FROM t WHERE id = $1',
        values: [5],
    });
});

test('colons inside string literals are left untouched', () => {
    assert.deepEqual(resolveParams("SELECT * FROM t WHERE tag = 'event:start' AND id = :id", { id: 9 }), {
        text: "SELECT * FROM t WHERE tag = 'event:start' AND id = $1",
        values: [9],
    });
});

test('escaped quotes inside a literal are handled', () => {
    assert.deepEqual(resolveParams("SELECT 'it''s:fine' WHERE id = :id", { id: 1 }), {
        text: "SELECT 'it''s:fine' WHERE id = $1",
        values: [1],
    });
});

test('missing named param throws', () => {
    assert.throws(() => resolveParams('SELECT :missing', {}), /missing named parameter "missing"/);
});

test('inherited prototype keys are not treated as valid params', () => {
    assert.throws(() => resolveParams('SELECT :constructor', {}), /missing named parameter "constructor"/);
});
