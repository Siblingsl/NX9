import { emptyCharacterLibrary } from './character';
import { emptyBacklotCustom } from '../data/backlot-templates';
import { emptySoundLibrary } from './sound-library';
export function emptyPublicLibrary() {
    return {
        version: 1,
        characters: emptyCharacterLibrary().characters,
        templates: emptyBacklotCustom().items,
        sounds: emptySoundLibrary().sounds,
    };
}
