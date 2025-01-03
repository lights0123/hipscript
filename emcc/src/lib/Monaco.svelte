<script lang="ts">
	import { onMount } from 'svelte';
	import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
	import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
	import 'monaco-editor/esm/vs/editor/editor.all';
	import * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

	let editorElement: HTMLElement;
	let editor: Monaco.editor.IStandaloneCodeEditor;

	let { contents } = $props();

	const SCHEME = '(prefers-color-scheme: dark)';

	onMount(() => {
		self.MonacoEnvironment = {
			getWorker(_, label) {
				return new editorWorker();
			}
		};
		const darkMode = matchMedia(SCHEME);

		editor = Monaco.editor.create(editorElement, {
			value: contents,
			language: 'cpp',
			automaticLayout: true,
			theme: darkMode.matches ? 'vs-dark' : 'vs'
		});
		window.editor = editor;
		let willSave = false;
		function save() {
			localStorage.setItem('hipscript-content', editor.getValue());
			willSave = false;
		}
		editor.onDidChangeModelContent((event) => {
			if (!willSave) {
				if (window.requestIdleCallback) window.requestIdleCallback(save, { timeout: 1000 });
				else setTimeout(save, 1000);
			}
			willSave = true;
		});
		function handleChange(e: MediaQueryList | MediaQueryListEvent) {
			Monaco.editor.setTheme(e.matches ? 'vs-dark' : 'vs');
		}
		handleChange(darkMode);
		// Monaco.languages.register(cpp);
		darkMode.addEventListener('change', handleChange);
		return () => darkMode.removeEventListener('change', handleChange);
	});

	export function getData() {
		return editor.getValue();
	}

	export function setData(s: string) {
		editor.setValue(s);
	}
</script>

<div bind:this={editorElement} class="h-full w-full flex-grow"></div>
