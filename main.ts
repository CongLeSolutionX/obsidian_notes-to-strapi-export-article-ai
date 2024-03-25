import {
	App,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from 'obsidian'

interface MyPluginSettings {
	strapiUrl: string
	strapiApiToken: string
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	strapiUrl: '',
	strapiApiToken: '',
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings

	async onload() {
		await this.loadSettings()

		const ribbonIconEl = this.addRibbonIcon(
			'italic-glyph',
			'Upload images to Strapi and update links in Markdown content',
			async (evt: MouseEvent) => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView)
				if (!activeView) {
					new Notice('No active Markdown view')
					return
				}

				if (!this.settings.strapiUrl || !this.settings.strapiApiToken) {
					new Notice(
						'Please configure Strapi URL and API token in the plugin settings'
					)
					return
				}

				new Notice('Processing Markdown content...')

				const editor = activeView.editor
				const content = editor.getValue()

				const imagePaths = this.extractImagePaths(content)

				new Notice('Uploading images to Strapi...')

				const uploadedImages = await this.uploadImagesToStrapi(imagePaths)

				if (Object.keys(uploadedImages).length === 0) {
					new Notice('No images found or uploaded')
					return
				}

				new Notice('Replacing image paths...')

				const updatedContent = this.replaceImagePaths(content, uploadedImages)

				editor.setValue(updatedContent)

				new Notice('Images uploaded and links updated successfully!')
			}
		)
		ribbonIconEl.addClass('my-plugin-ribbon-class')

		this.addSettingTab(new MyExportSettingTab(this.app, this))
	}

	async getImageBlobsFromNote(
		noteFile: TFile
	): Promise<Array<{ path: string; blob: Blob }>> {
		// Read the content of the note
		const content = await this.app.vault.read(noteFile)
		// Extract image paths using a regular expression
		const imagePaths = this.extractImagePaths(content)

		const blobs = []

		for (const path of imagePaths) {
			// Resolve the image path to an actual file object
			let imageFile = this.app.vault.getAbstractFileByPath(path)

			// If the file doesn't exist directly by the path, it might be relative
			if (!imageFile) {
				const noteDir = noteFile.parent.path
				const fullPath = noteDir + '/' + path
				imageFile = this.app.vault.getAbstractFileByPath(fullPath)
			}

			if (imageFile instanceof TFile) {
				// Read the file as a binary blob
				const blob = await this.app.vault.readBinary(imageFile)
				blobs.push({ path, blob })
			}
		}

		return blobs
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}

	extractImagePaths(content: string): string[] {
		const markdownImageRegex = /!\[.*?\]\((.*?)\)/g
		const obsidianEmbedRegex = /!\[\[(.*?)\]\]/g
		let match
		const imagePaths = []

		// Extract Markdown image paths
		while ((match = markdownImageRegex.exec(content)) !== null) {
			imagePaths.push(match[1])
		}

		// Extract Obsidian embed paths
		while ((match = obsidianEmbedRegex.exec(content)) !== null) {
			imagePaths.push(match[1].split('|')[0])
		}

		return imagePaths
	}

	async uploadImagesToStrapi(
		imagePaths: string[]
	): Promise<{ [key: string]: string }> {
		const uploadedImages: { [key: string]: string } = {}

		for (const imagePath of imagePaths) {
			const formData = new FormData()
			const imageFile = await this.readImageAsBlob(imagePath)
			const fileName = imagePath.split('/').pop()

			console.log('imageFile:', imageFile)
			console.log('fileName:', fileName)
			formData.append('files', imageFile, fileName)
			console.log("formData.get('files'):", formData.get('files'))

			try {
				console.log('Uploading image:', imagePath, formData)
				const response = await fetch(`${this.settings.strapiUrl}/api/upload`, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${this.settings.strapiApiToken}`,
					},
					body: formData,
				})

				if (response.ok) {
					const data = await response.json()
					uploadedImages[imagePath] = data[0].url
				} else {
					new Notice(`Failed to upload image: ${imagePath}`)
					console.error(`Failed to upload image: ${imagePath}`)
					console.error('Error response:', await response.json())
				}
			} catch (error) {
				new Notice(`Error uploading image: ${imagePath}`)
				console.error(`Error uploading image: ${imagePath}`, error)
			}
		}

		return uploadedImages
	}

	async readImageAsBlob(imagePath: string): Promise<Blob> {
		const adapter = this.app.vault.adapter
		const imageFile = await adapter.read(imagePath)

		const arr = new Uint8Array(imageFile.length)
		for (let i = 0; i < imageFile.length; i++) {
			arr[i] = imageFile.charCodeAt(i)
		}

		const blob = new Blob([arr], { type: 'image/png' })
		return blob
	}

	replaceImagePaths(
		content: string,
		uploadedImages: { [key: string]: string }
	): string {
		for (const [localPath, remotePath] of Object.entries(uploadedImages)) {
			content = content.replace(localPath, remotePath)
		}
		return content
	}
}

class MyExportSettingTab extends PluginSettingTab {
	plugin: MyPlugin

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		new Setting(containerEl)
			.setName('Strapi URL')
			.setDesc('Enter your Strapi instance URL')
			.addText(text =>
				text
					.setPlaceholder('https://your-strapi-url')
					.setValue(this.plugin.settings.strapiUrl)
					.onChange(async value => {
						this.plugin.settings.strapiUrl = value
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName('Strapi API Token')
			.setDesc('Enter your Strapi API token')
			.addText(text =>
				text
					.setPlaceholder('Enter your token')
					.setValue(this.plugin.settings.strapiApiToken)
					.onChange(async value => {
						this.plugin.settings.strapiApiToken = value
						await this.plugin.saveSettings()
					})
			)
	}
}
