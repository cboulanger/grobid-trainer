# grobid-trainer 


Submenus:

```json
{
		"menus": {
			"editor/context": [
				{
					"submenu": "grobid-trainer.commands",
					"group": "1_modification",
					"when": "resourceExtname == '.xml'"
				}				
			],
			"grobid-trainer.commands": [
				{
					"command": "grobid-trainer.removeLbIndentation"		
				},
				{
					"command": "grobid-trainer.tagSelection"	
				}
			]
		},
		"submenus": [
		  {
			"id": "grobid-trainer.commands",
			"label": "GROBID Commands"
		  },
		  {
			"id": "grobid-trainer.markup",
			"label": "GROBID Markup"
		  }		  
		]
}
```
