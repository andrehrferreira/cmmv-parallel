//@ts-nocheck
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';

import { 
    Application, Hooks,
    HooksType, Hook
} from "@cmmv/core";

import {
    AbstractParallel,
    Parallel, Tread, 
    ThreadData, ParallelModule, 
    ParallelProvider, ThreadPool
} from "../src";

export class ReadBigFileWithParallel extends AbstractParallel {
    @Hook(HooksType.onInitialize)
    async start() {
        const finalData = new Array<any>();
        const poolNamespace= "parserLine";
        const pool = ThreadPool.getThreadPool(poolNamespace);
        const filename = path.resolve('./sample/large-customers.json');

        if(pool){
            const start = Date.now();
            const readStream = fs.createReadStream(path.resolve(filename));
            const jsonStream = readStream.pipe(parser()).pipe(streamArray());

            pool.on('data', ({ data, index }) => finalData[index] = data);
            pool.on('end', () => {
                const end = Date.now();
                console.log(`Parallel parser: ${finalData.length} | ${end - start}ms`);
            });
    
            jsonStream.on('data', ({ value, key }) => pool.send({ value, index: key }));
            jsonStream.on('end', () => pool.endData());
            jsonStream.on('error', error => console.error(error));

            await pool.awaitEnd();
        }
        else {
            throw new Error(`Thread pool '${poolNamespace}' not found`);
        }
    }

    /*@TreadContext("parserLine")
    async threadContext() {
        
    }*/

    @Parallel({
        namespace: "parserLine",
        threads: 6
    })
    async parserLine(@Tread() thread: any, @ThreadData() payload: any) {
        const { 
            JSONParser, AbstractParserSchema,
            ToObjectId, ToLowerCase, ToDate 
        } = await import("@cmmv/normalizer");

        class CustomerSchema extends AbstractParserSchema {
            public field = {
                id: {
                    to: 'id',
                    transform: [ToObjectId],
                },
                name: { to: 'name' },
                email: {
                    to: 'email',
                    validation: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
                    transform: [ToLowerCase],
                },
                registrationDate: {
                    to: 'createdAt',
                    transform: [ToDate],
                },
            };
        }

        const jsonParser = new JSONParser({ schema: CustomerSchema });
        //return { jsonParser };

        thread.parentPort.postMessage({ 
            data: await jsonParser.parser(payload.value), 
            index: payload.index 
        });
    }
}

export class ReadBigFileWithoutParallel {
    @Hook(HooksType.onInitialize)
    async start() {
        const { 
            JSONParser, AbstractParserSchema,
            ToObjectId, ToLowerCase, ToDate 
        } = await import("@cmmv/normalizer");
        const finalData = new Array<any>();
        const poolNamespace= "parserLine";
        const pool = ThreadPool.getThreadPool(poolNamespace);
        const filename = path.resolve('./sample/large-customers.json');

        if(pool){
            const start = Date.now();

            class CustomerSchema extends AbstractParserSchema {
                public field = {
                    id: {
                        to: 'id',
                        transform: [ToObjectId],
                    },
                    name: { to: 'name' },
                    email: {
                        to: 'email',
                        validation: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
                        transform: [ToLowerCase],
                    },
                    registrationDate: {
                        to: 'createdAt',
                        transform: [ToDate],
                    },
                };
            }

            const jsonParser = new JSONParser({ 
                schema: CustomerSchema,
                input: filename
            })
            .pipe(async data => finalData.push(data))
            .once('end', () => {
                const end = Date.now();
                console.log(`Single parser: ${finalData.length} | ${end - start}ms`);
            })
            .once('error', (error) => console.error(error))
            .start();
        }
        else {
            throw new Error(`Thread pool '${poolNamespace}' not found`);
        }
    }
}

Application.exec({
    modules: [ParallelModule],
    services: [ParallelProvider]
});