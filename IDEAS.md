# Ideas

## Maintenance
- During maintenance, disable links/buttons with JavaScript so the user stays on the same page rather than hitting a dead end. (`maintenance-link-guard` exists but is currently hidden from users because it wasn't working reliably — this would be part of fixing/replacing it.)

## Wanted List – Edit Page
- Save state before saving (snapshot for rollback/protection).
- Modification history with undo/redo (forward and backward buttons).


## Wanted List – Other Pages
- Add image and link to a set on the wanted list page when the list title contains a set number.
- Associate a set with a wanted list so the set picture is shown. we might be able to use this endpoint: https://www.bricklink.com/ajax/clone/wanted/addinfo.ajax?itemType=S&catID=609.  I dont' see a way to look up by set number.  If we had the category we could look up all the sets in that cat.
- Reverse sort order of wanted lists on the "Upload to Wanted List" page (there are two lists there).
- Move "Create New Wanted List" to the top of the list.

## General UI
- Pressing Esc while a modal is open should close it.
