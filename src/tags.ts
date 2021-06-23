export type Tag = {
    tag: string,
    attr?: {
        name: string,
        value: string
    }[],
    descr: string
};
export const teiTags: Tag[] = [
    {
        tag: "titlePage",
        descr: "Cover page"
    },
    {
        tag: "front",
        descr: "Document header"
    },
    {
        tag: "note",
        attr: [{
            name: "place",
            value: "headnote"
        }],
        descr: "Page header"
    },
    {
        tag: "note",
        attr: [{
            name: "place",
            value: "footnote"
        }],
        descr: "Page footer and numbered footnotes"
    },
    {
        tag: "body",
        descr: "Document body"
    },		
    {
        tag: "listBibl",
        descr: "Bibliography"
    },
    {
        tag: "page",
        descr: "Page numbers"
    },
    {
        tag: "div",
        attr: [{
            name: "type",
            value: "annex"
        }],
        descr: "Page footer and numbered footnotes"
    },
    {
        tag: "div",
        attr: [{
            name: "type",
            value: "acknowledgment"
        }],
        descr: "Page footer and numbered footnotes"
    },
    {
        tag: "div",
        attr: [{
            name: "type",
            value: "toc"
        }],
        descr: "Table of contents"
    },		
];