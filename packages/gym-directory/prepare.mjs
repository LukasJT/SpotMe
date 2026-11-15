// Prepare a reviewable batch from an already licensed export. Never fetch source data.
const normalize = value => value.normalize('NFKC').trim().replace(/\s+/gu,' ');
const fold = value => normalize(value).toLocaleLowerCase('en-CA');
const valid = (value,limit) => typeof value === 'string' && value.isWellFormed() && !/\p{Cc}/u.test(value) && normalize(value).length>0 && normalize(value).length<=limit;

function prepareGymBatch(records, cities) {
  if (!Array.isArray(records) || !Array.isArray(cities)) throw new TypeError('Expected record and city arrays');
  const allowed = new Map(cities.map(city=>[city.municipality_code,city]));
  const sourceRows = new Map(), branches = new Map();
  const accepted = [], review = [], rejected = [];
  records.forEach((record,index)=>{
    const fields = {provider:80,provider_record_id:160,licence_reference:300,municipality_code:80,display_name:160,street_address:240};
    const observed = typeof record?.observed_at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(record.observed_at) && Date.parse(record.observed_at);
    if (!observed || !Object.entries(fields).every(([key,limit])=>valid(record?.[key],limit))) {
      rejected.push({index,reason:'missing_or_invalid_provenance_or_listing'});
      return;
    }
    const row=Object.fromEntries(Object.keys(fields).map(key=>[key,normalize(record[key])]));
    const city=allowed.get(row.municipality_code);
    if (city?.province!=='ON') {rejected.push({index,reason:'municipality_not_in_ontario_manifest'});return;}
    const sourceKey=JSON.stringify([fold(row.provider),row.provider_record_id]);
    const branchKey=JSON.stringify([row.municipality_code,fold(row.display_name),fold(row.street_address)]);
    if (sourceRows.has(sourceKey)) {
      review.push({index,previous:sourceRows.get(sourceKey),reason:'repeated_source_identifier'});
      return;
    }
    sourceRows.set(sourceKey,index);
    if (branches.has(branchKey)) {
      review.push({index,previous:branches.get(branchKey),reason:'possible_same_branch'});
      return;
    }
    branches.set(branchKey,index);
    accepted.push({...row,observed_at:new Date(observed).toISOString(),listing_status:'pending'});
  });
  return {accepted,review,rejected};
}

export {prepareGymBatch};
