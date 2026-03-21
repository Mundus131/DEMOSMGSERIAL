export const getFrontBackKeys = (obj) => {
  const keys = Object.keys(obj || {});
  const frontKey = keys.find((key) => key.toLowerCase().includes('prz')) || 'przod';
  const backKey = keys.find((key) => key.toLowerCase().includes('tyl')) || 'tyl';
  return { frontKey, backKey };
};

export const ensureTwoValues = (values) => {
  if (!values || values.length === 0) return ['NoRead', 'NoRead'];
  if (values.length === 1) return [values[0], 'NoRead'];
  return values.slice(0, 2);
};

export const filterResults = (results) => {
  if (!results) return {};

  const filtered = { ...results };
  const { frontKey, backKey } = getFrontBackKeys(filtered);
  const existsInSide = (value) => filtered.lewy?.includes(value) || filtered.prawy?.includes(value);

  if (filtered[frontKey]?.[0] && filtered[frontKey][0] !== 'NoRead' && existsInSide(filtered[frontKey][0])) {
    filtered[frontKey] = ['NoRead'];
  }

  if (filtered[backKey]?.[0] && filtered[backKey][0] !== 'NoRead' && existsInSide(filtered[backKey][0])) {
    filtered[backKey] = ['NoRead'];
  }

  return filtered;
};

export const shouldShow6Tiles = (filteredResults) => {
  if (!filteredResults) return false;

  const { frontKey, backKey } = getFrontBackKeys(filteredResults);
  const front = filteredResults[frontKey] || [];
  const back = filteredResults[backKey] || [];

  return front.some((value) => value !== 'NoRead') || back.some((value) => value !== 'NoRead');
};
