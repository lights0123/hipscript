import { init } from '@wasmer/sdk';
export * from '@wasmer/sdk';
import sdkUrl from '@wasmer/sdk?worker&url';
import module from '@wasmer/sdk/wasm?url';
import workerUrl from './wasmer.worker?worker&url';

export default function () {
	return init({ module, sdkUrl, workerUrl });
}
