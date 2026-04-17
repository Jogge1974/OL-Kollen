const { XMLParser } = require('fast-xml-parser');
const p = new XMLParser({ attributeNamePrefix: '', ignoreAttributes: false, parseTagValue: false, trimValues: true });
const xml = `<ClassStart numberOfEntries="35">
  <EventClass lowAge="40" sequence="360" sex="B" numberOfEntries="35">
    <EventClassId>654330</EventClassId>
    <Name>H40</Name>
    <ClassShortName>H40</ClassShortName>
    <ClassRaceInfo noOfEntries="18" noOfStarts="16">
      <EventRaceId>55480</EventRaceId>
      <Name></Name>
    </ClassRaceInfo>
  </EventClass>
</ClassStart>`;
const r = p.parse(xml);
const classNode = r.ClassStart;
console.log('classNode keys:', Object.keys(classNode));
console.log('classNode.Class:', classNode.Class);
console.log('classNode.EventClass:', JSON.stringify(classNode.EventClass, null, 2));
const eventClass = classNode.EventClass;
console.log('eventClass.ClassRaceInfo:', JSON.stringify(eventClass?.ClassRaceInfo, null, 2));
console.log('typeof ClassRaceInfo:', typeof eventClass?.ClassRaceInfo);
console.log('Array?:', Array.isArray(eventClass?.ClassRaceInfo));
