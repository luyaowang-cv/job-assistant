import type { CommonBasics, Education } from '../schemas/personal-profile'

export function resolveBasics(common: CommonBasics = {}, overrides: CommonBasics = {}) {
  const nonEmptyOverrides = Object.fromEntries(Object.entries(overrides).filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value)))
  return Object.fromEntries(Object.entries({ ...common, ...nonEmptyOverrides }).filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value))) as CommonBasics
}
export function resolveEducations(common: Education[] = [], overrides: Education[] = []) { return overrides.length > 0 ? overrides : common }
