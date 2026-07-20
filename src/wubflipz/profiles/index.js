const profiles = new Map()

export function registerProfile(profile) {
  profiles.set(profile.id, profile)
}

export function getProfile(id) {
  return profiles.get(id) || null
}

export function getAllProfiles() {
  return Array.from(profiles.values())
}

export function getProfilesForGenre(genre) {
  return getAllProfiles().filter(p =>
    p.label.toLowerCase() === genre.toLowerCase() ||
    p.aliases?.some(a => a.toLowerCase() === genre.toLowerCase())
  )
}

export function resolveGenreToProfiles(genres) {
  const matched = []
  for (const genre of genres) {
    const found = getProfilesForGenre(genre)
    if (found.length > 0) matched.push(...found)
  }
  return matched.length > 0 ? matched : [getProfile('dubstep') || getAllProfiles()[0]]
}
