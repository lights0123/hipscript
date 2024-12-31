<script lang="ts">
	import { onMount } from 'svelte';
	import contents from './hi.hip?raw';
	import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
	import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
	import 'monaco-editor/esm/vs/editor/editor.all';
	import * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

	let editorElement: HTMLElement;
	let editor: Monaco.editor.IStandaloneCodeEditor;
	onMount(async () => {
		self.MonacoEnvironment = {
			getWorker(_, label) {
				console.log(_, label);
				return new editorWorker();
			}
		};

		// import('monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution')
		// const Monaco = await import('monaco-editor/esm/vs/editor/editor.api');
		window.Monaco = Monaco;
		editor = Monaco.editor.create(editorElement, {
			value: contents,
			language: 'cpp',
			automaticLayout: true
		});
		// Monaco.languages.register(cpp);
	});

	export function getData() {
		return editor.getValue();
	}
</script>

<div bind:this={editorElement} class="h-full w-full"></div>
