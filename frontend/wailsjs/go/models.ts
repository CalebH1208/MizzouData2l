export namespace Backend {
	
	export class Channel_info {
	    name: string;
	    unit: string;
	    color: string;
	    graphIndex: number;
	
	    static createFrom(source: any = {}) {
	        return new Channel_info(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.unit = source["unit"];
	        this.color = source["color"];
	        this.graphIndex = source["graphIndex"];
	    }
	}
	export class Channel_viewport {
	    name: string;
	    unit: string;
	    color: string;
	    values: number[];
	    yRange: number[];
	
	    static createFrom(source: any = {}) {
	        return new Channel_viewport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.unit = source["unit"];
	        this.color = source["color"];
	        this.values = source["values"];
	        this.yRange = source["yRange"];
	    }
	}
	export class Fragment_channel {
	    name: string;
	    unit: string;
	    values: number[];
	
	    static createFrom(source: any = {}) {
	        return new Fragment_channel(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.unit = source["unit"];
	        this.values = source["values"];
	    }
	}
	export class Data_fragment {
	    id: string;
	    name: string;
	    startTime: number;
	    endTime: number;
	    timeStamps: number[];
	    channels: Record<string, Fragment_channel>;
	
	    static createFrom(source: any = {}) {
	        return new Data_fragment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.startTime = source["startTime"];
	        this.endTime = source["endTime"];
	        this.timeStamps = source["timeStamps"];
	        this.channels = this.convertValues(source["channels"], Fragment_channel, true);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Fragment_metadata {
	    id: string;
	    name: string;
	    startTime: number;
	    endTime: number;
	    pointCount: number;
	    duration: number;
	    channelNames: string[];
	
	    static createFrom(source: any = {}) {
	        return new Fragment_metadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.startTime = source["startTime"];
	        this.endTime = source["endTime"];
	        this.pointCount = source["pointCount"];
	        this.duration = source["duration"];
	        this.channelNames = source["channelNames"];
	    }
	}
	export class Graph_configuration {
	    title: string;
	    channelNames: string[];
	
	    static createFrom(source: any = {}) {
	        return new Graph_configuration(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.channelNames = source["channelNames"];
	    }
	}
	export class Graph_info {
	    index: number;
	    title: string;
	    yRange: number[];
	    useSplitAxis: boolean;
	    channelNames: string[];
	    channelCount: number;
	
	    static createFrom(source: any = {}) {
	        return new Graph_info(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.title = source["title"];
	        this.yRange = source["yRange"];
	        this.useSplitAxis = source["useSplitAxis"];
	        this.channelNames = source["channelNames"];
	        this.channelCount = source["channelCount"];
	    }
	}
	export class Graph_metadata {
	    totalPoints: number;
	    timeRange: number[];
	    numGraphs: number;
	    graphInfo: Graph_info[];
	    availableLODs: number[];
	    totalChannels: number;
	    cursorPos: number;
	
	    static createFrom(source: any = {}) {
	        return new Graph_metadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.totalPoints = source["totalPoints"];
	        this.timeRange = source["timeRange"];
	        this.numGraphs = source["numGraphs"];
	        this.graphInfo = this.convertValues(source["graphInfo"], Graph_info);
	        this.availableLODs = source["availableLODs"];
	        this.totalChannels = source["totalChannels"];
	        this.cursorPos = source["cursorPos"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Graph_viewport {
	    index: number;
	    title: string;
	    yRange: number[];
	    useSplitAxis: boolean;
	    channels: Channel_viewport[];
	
	    static createFrom(source: any = {}) {
	        return new Graph_viewport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.title = source["title"];
	        this.yRange = source["yRange"];
	        this.useSplitAxis = source["useSplitAxis"];
	        this.channels = this.convertValues(source["channels"], Channel_viewport);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Telemetry_channel {
	    Name: string;
	    Unit: string;
	    Conversion: number;
	    OriginalConv: number;
	    Data: number[];
	    OriginalData: number[];
	
	    static createFrom(source: any = {}) {
	        return new Telemetry_channel(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Unit = source["Unit"];
	        this.Conversion = source["Conversion"];
	        this.OriginalConv = source["OriginalConv"];
	        this.Data = source["Data"];
	        this.OriginalData = source["OriginalData"];
	    }
	}
	export class Telemetry_file {
	    name: string;
	    tags: string[];
	    channels: Telemetry_channel[];
	
	    static createFrom(source: any = {}) {
	        return new Telemetry_file(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.tags = source["tags"];
	        this.channels = this.convertValues(source["channels"], Telemetry_channel);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Tool_info {
	    name: string;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new Tool_info(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	    }
	}
	export class Tool_result {
	    toolName: string;
	    resultType: string;
	    data: any;
	    metadata: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new Tool_result(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.toolName = source["toolName"];
	        this.resultType = source["resultType"];
	        this.data = source["data"];
	        this.metadata = source["metadata"];
	    }
	}
	export class Viewport_request {
	    startTime: number;
	    endTime: number;
	
	    static createFrom(source: any = {}) {
	        return new Viewport_request(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.startTime = source["startTime"];
	        this.endTime = source["endTime"];
	    }
	}
	export class Viewport_response {
	    timestamps: number[];
	    originalIndices: number[];
	    graphs: Graph_viewport[];
	    breakIndices: number[];
	    exportStarts: number[];
	    exportEnds: number[];
	    lodStep: number;
	    totalPoints: number;
	    viewportStart: number;
	    viewportEnd: number;
	    cursorPos: number;
	
	    static createFrom(source: any = {}) {
	        return new Viewport_response(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamps = source["timestamps"];
	        this.originalIndices = source["originalIndices"];
	        this.graphs = this.convertValues(source["graphs"], Graph_viewport);
	        this.breakIndices = source["breakIndices"];
	        this.exportStarts = source["exportStarts"];
	        this.exportEnds = source["exportEnds"];
	        this.lodStep = source["lodStep"];
	        this.totalPoints = source["totalPoints"];
	        this.viewportStart = source["viewportStart"];
	        this.viewportEnd = source["viewportEnd"];
	        this.cursorPos = source["cursorPos"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

