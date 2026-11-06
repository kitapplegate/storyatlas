# Next

**Action:** On your phone (Chrome), record a new story and mention your address ("I lived at 123 Oak Street, Springfield") — confirm the address chip appears in the Place step and the map pin drops on the correct street.
**Why now:** The address-detection fix (`e384967`) is live but has not been observed on a real device. This is the one unverified item.
**Start here:** https://kitapplegate.github.io/storyatlas (page source should show `app.js?v=20261105a`)
**Verify with:** Address chip appears with the street name; map centers on or near the address; pin is droppable.
**Watch out for:** Nominatim may not find very short or rural street addresses — if the chip appears but the geocode fails, the manual Search box is pre-filled and the user can tap Search.
