import {
  buildSafeOrIlikeFilter,
  postgrestOrIlikeFilterValue,
  sanitizePostgrestIdList,
  sanitizePostgrestSearchTerm,
  sqlIlikePattern,
} from './postgrest-filter.util';

describe('postgrest-filter.util', () => {
  it('trims and caps search length; commas stripped in filter builders', () => {
    expect(sanitizePostgrestSearchTerm('  foo,bar  ')).toBe('foo,bar');
    expect(sanitizePostgrestSearchTerm('x'.repeat(300)).length).toBe(200);
  });

  it('escapes ILIKE wildcards', () => {
    expect(sqlIlikePattern('100%_done')).toBe('%100\\%\\_done%');
  });

  it('quotes PostgREST .or() ilike values (dots and commas safe)', () => {
    const v = postgrestOrIlikeFilterValue('MRCCC.26,464');
    expect(v.startsWith('"')).toBe(true);
    expect(v.endsWith('"')).toBe(true);
    expect(v).not.toContain(',464');
  });

  it('buildSafeOrIlikeFilter rejects injection in search term', () => {
    const expr = buildSafeOrIlikeFilter(
      ['project_name', 'project_code'],
      'x"),id.neq.0,project_name.ilike.("',
    );
    expect(expr).toContain('project_name.ilike.');
    expect(expr).not.toMatch(/,id\.neq/);
  });

  it('sanitizePostgrestIdList drops malformed ids', () => {
    expect(sanitizePostgrestIdList(['abc-123', 'bad;drop', ''])).toEqual(['abc-123']);
  });
});
