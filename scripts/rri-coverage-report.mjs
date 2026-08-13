import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isIsoCountryCode } from '../shared/countries.ts'

const path = resolve(import.meta.dirname, '../docs/research/rri-member-list-coverage.md')
const markdown = await readFile(path, 'utf8')
const rows = markdown.split(/\r?\n/).flatMap((line) => {
  const match = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/.exec(line)
  if (!match) return []
  const iso = match[4].replaceAll('`', '').trim()
  return [{ number: Number(match[1]), grouping: match[2].trim(), displayedRow: match[3].trim(), iso: iso === '—' ? null : iso, nationalProgram: match[5].trim() === '—' ? null : match[5].trim(), status: match[6].trim().startsWith('program not verified') ? 'program-not-verified' : 'country-information-directory-incomplete' }]
})
if (rows.length !== 75 || rows.some((row, index) => row.number !== index + 1)) throw new Error('RRI coverage inventory must contain exactly 75 consecutively numbered displayed rows.')
if (rows.some((row) => row.iso !== null && !isIsoCountryCode(row.iso))) throw new Error('RRI coverage inventory contains an unsupported ISO code.')
const counts = (values) => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]))
console.log(JSON.stringify({
  displayedRows: rows.length,
  isoMappedRows: rows.filter((row) => row.iso).length,
  intentionallyUnmappedRows: rows.filter((row) => !row.iso).length,
  verifiedNationalPrograms: rows.filter((row) => row.nationalProgram).length,
  byGrouping: counts(rows.map((row) => row.grouping)),
  byCoverageState: counts(rows.map((row) => row.status)),
}, null, 2))
