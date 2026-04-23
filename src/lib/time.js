function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

function toIsoOrNull(value) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

module.exports = {
  addSeconds,
  toIsoOrNull,
};