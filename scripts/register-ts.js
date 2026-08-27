import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('amaro', pathToFileURL(`${import.meta.dirname}/`));
