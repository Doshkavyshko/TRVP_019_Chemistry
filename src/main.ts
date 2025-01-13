import express, {Response, Request} from 'express';
import path, {dirname} from 'path';
import * as http from "node:http";
import pg, {ClientConfig} from 'pg'
import * as fs from "node:fs";
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const {Client} = pg;

class httpServer {
    public app: express.Application;
    private readonly port: number = 3000;
    private dbClient: pg.Client | undefined = undefined;

    constructor() {
        this.app = express();
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, '..')));
        this.app.use(express.static(path.join(__dirname, '..', 'static')));
        this.app.use(express.static('public', {
            setHeaders: (res, path) => {
                if (path.endsWith('.js')) {
                    res.set('Content-Type', 'application/javascript');
                }
            }
        }));

        this.port = 3000;

        http.createServer(this.app).listen(this.port, () => {
            console.log(`Server started on port ${this.port}.\n http://localhost:${this.port}`);
        });
    }

    public async dbConnect(config: ClientConfig) {
        try {
            this.dbClient = new Client(config);
            await this.dbClient.connect();
        } catch (e) {
            console.error(e);
        }
    }

    public async dbExecute(sql: string, commit: boolean, values?: string[]): Promise<pg.QueryResult> {
        if (this.dbClient) {
            try {
                await this.dbClient.query('BEGIN');
                const result = this.dbClient.query(sql, values);
                if (commit) {
                    await this.dbClient.query('COMMIT');
                }
                return result;
            } catch (e) {
                await this.dbClient.query('ROLLBACK');
                console.error(e);
            }
        }
        throw new Error('Not connected to DB');
    }
}

try {
    const server = new httpServer();
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pg.json')).toString());
    await server.dbConnect(config);

    server.app.get('/', (req, res) => {
        res.sendFile(path.resolve('static/html/index.html'));
    });

    server.app.get('/allOrders', async (req, res) => {
        try {
            const sql = 'SELECT public.order.id as id, fullname, date, public.order.recipe, positions FROM public.order ' +
                'JOIN public.drug ON public.order.recipe = public.drug.id';
            const queryResult = await server.dbExecute(sql, true);
            res.status(200).send(queryResult.rows);
        } catch (e) {
            console.error(e);
            res.status(400).send(e);
        }
    });

    server.app.get('/drug', async (req, res) => {
        try {
            const {id} = req.query;
            const sql = `SELECT * FROM public.drug `
                + (id ? `WHERE id = '${id}'` : '')
            const queryResult = await server.dbExecute(sql, true);
            res.status(200).send(queryResult.rows);
        } catch (e) {
            console.error(e);
            res.status(400).send(e);
        }
    });

    server.app.put('/drug', async (req, res) => {
        try {
            const body = req.body;
            if (Object.keys(body).length === 0) {
                throw new Error('Empty body');
            }
            const sql = `INSERT INTO public.drug (id, value, recipe, amount) `
                + `VALUES ('${body.id}', '${body.value}', ${body.recipe}, ${body.amount})`
            await server.dbExecute(sql, true);
            res.status(200).send();
        } catch (e) {
            console.error(e);
            res.status(400).send(e);
        }
    });

    server.app.patch('/drug', async (req, res) => {
        try {
            const body = req.body;
            if (Object.keys(body).length === 0) {
                throw new Error('Empty body');
            }
            const sql = `UPDATE public.drug SET amount = '${body.amount}' WHERE id = '${body.id}'`;
            await server.dbExecute(sql, true);
            res.status(200).send();
        } catch (e) {
            console.log(e);
            res.status(400).send(e);
        }
    });

    server.app.post('/drug', async (req, res) => {
        try {
            const body = req.body;
            if (Object.keys(body).length === 0) {
                throw new Error('Empty body');
            }
            const sql = `UPDATE public.drug SET amount = amount + '${body.amount}'`;
            await server.dbExecute(sql, true);
            res.status(200).send();
        } catch (e) {
            console.log(e);
            res.status(400).send(e);
        }
    });

    server.app.post('/order', async (req, res) => {
        try {
            const {id, positionId, drugId} = req.query;
            if (!id) {
                throw new Error('Empty id');
            }
            const body = req.body;
            if (Object.keys(body).length === 0) {
                throw new Error('Empty body');
            }
            let sql: string;
            if (positionId) {
                const position = body.position;
                if (position.remove) {
                    sql = `DELETE FROM public.position WHERE id = '${positionId}'`;
                } else {
                    sql = `INSERT INTO public.position (id, drug, count) `
                        + `VALUES ('${position.id}', '${position.drug}', ${position.count})`;
                }
                await server.dbExecute(sql, false);
            }
            if (drugId) {
                const drug = body.drug;
                if (drug.remove) {
                    sql = `UPDATE public.drug `
                        + 'SET '
                        + `amount = amount - ${drug.amount} `
                        + `WHERE id = '${drugId}'`;
                } else {
                    sql = `UPDATE public.drug `
                        + 'SET '
                        + `amount = amount + ${drug.amount} `
                        + `WHERE id = '${drugId}'`;
                }
                await server.dbExecute(sql, false);
            }
            const set =
                [(body.itemId
                    ? (body.remove
                        ? `positions = array_remove(positions, '${body.itemId}')`
                        : `positions = array_append(positions, '${body.itemId}')`)
                    : '')
                , (body.fullname
                    ? `fullname = '${body.fullname}'`
                    : '')
                , (body.date
                    ? `date = '${body.date}'`
                    : '')]
            sql = `UPDATE public.order `
                + `SET `
                + set.filter(value => value.length > 0).join(', ') + ' '
                +`WHERE id = '${id}' `
                + (body.itemId
                    ? (body.remove
                        ? `AND '${body.itemId}' = ANY(positions)`
                        : `AND '${body.itemId}' != ALL(positions)`)
                    : '');
            await server.dbExecute(sql, true);
            res.status(200).send();
        } catch (e) {
            console.error(e);
            res.status(400).send(e);
        }
    });

    server.app.put('/order', async (req, res) => {
        try {
            const body = req.body;
            if (Object.keys(body).length === 0) {
                throw new Error('Empty body');
            }
            const sql = `INSERT INTO public.order (id, fullname, date, recipe) `
                + `VALUES ('${body.id}', '${body.fullname}', '${body.date}', '${body.recipe}')`
            await server.dbExecute(sql, true);
            res.status(200).send();
        } catch (e) {
            console.error(e);
            res.status(400).send(e);
        }
    });

    server.app.delete('/order', async (req, res) => {
        try {
            const {id, date} = req.query;
            let sql = `SELECT * FROM public.order ` +
                    (id ? `WHERE id = '${id}'` : `WHERE date < '${date}'`);
            const result: any = await server.dbExecute(sql, true);
	    const rows: any[] = result.rows;
	    for (const row of rows) {
		sql = `SELECT * FROM public."position" `
			+ `WHERE id IN (${row.positions.map((position: any) => `'${position}'`).join(', ')})`;
		const positions = (await server.dbExecute(sql, true)).rows;
		for (const position of positions) {
			console.log(position);
			sql = `UPDATE public.drug `
				+ `SET amount = amount + ${position.count} `
				+ `WHERE id = '${position.drug}'`;
			await server.dbExecute(sql, false);
			sql = `DELETE FROM public.position `
				+ `WHERE id = '${position.id}'`;
			await server.dbExecute(sql, false);
		}
	    }
	    sql = `DELETE FROM public.order ` +
                    (id ? `WHERE id = '${id}'` : `WHERE date < '${date}'`);
	    await server.dbExecute(sql, true);
            res.status(200).send();
        } catch (e) {
            console.error(e);
            res.status(400).send(e);
        }
    });

    server.app.get('/position', async (req, res) => {
        try {
            const {id} = req.query;
            const sql = `SELECT * FROM public.position `
                + (id
                    ? `WHERE id = '${id}' `
                    : '');
            const queryResult = await server.dbExecute(sql, true);
            res.status(200).send(queryResult.rows);
        } catch (e) {
            console.error(e);
            res.status(400).send(e);
        }
    });

    server.app.get('/recipe', async (req, res) => {
        try {
            const {id} = req.query;
            if (id) {
                const sql = `SELECT * FROM public.drug ` +
                    `WHERE id = '${id}'`;
                const queryResult = await server.dbExecute(sql, true);
                res.status(200).send(queryResult.rows);
            } else {
                const sql = `SELECT * FROM public.drug ` +
                    `WHERE recipe = true`;
                const queryResult = await server.dbExecute(sql, true);
                res.status(200).send(queryResult.rows);
            }
        } catch (e) {
            console.error(e);
            res.status(400).send(e);
        }
    });

    server.app.get('/recipe-id', async (req, res) => {
        try {
            const {value} = req.query;
            const sql = `SELECT public.drug.id FROM public.drug ` +
                `WHERE value = '${value}'`;
            const queryResult = await server.dbExecute(sql, true);
            res.status(200).send(queryResult.rows);
        } catch (e) {
            console.error(e);
            res.status(400).send(e);
        }
    });

    async function postPosition(req: Request, res: Response) {
        try {
            const {id, drugId} = req.query;
            if (!id) {
                throw new Error('Empty id');
            }
            const body = req.body;
            if (Object.keys(body).length === 0) {
                throw new Error('Empty body');
            }
            let sql: string;
            if (drugId) {
                const drug = body.drug;
                sql = 'UPDATE public.drug '
                    + 'SET '
                    + `amount = amount + ${drug.amount} `
                    + `WHERE id = '${drugId}'`;
                await server.dbExecute(sql, false);
            }
            const set = [(body.drug
                ? `drug = '${body.drugId}'`
                : '')
            , (body.count
                ? `count = ${body.count}`
                : '')];
            sql = 'UPDATE public.position '
                + 'SET '
                + set.filter(value => value.length > 0).join(', ') + ' '
                + `WHERE id = '${id}'`
	console.log(sql);
            await server.dbExecute(sql, true);
            res.status(200).send();
        } catch (e) {
            console.error(e);
            res.status(400).send(e);
        }
    }

    server.app.post('/position', postPosition);

    async function putPosition(req: Request, res: Response) {
        try {
            const body = req.body;
            if (Object.keys(body).length === 0) {
                throw new Error('Empty body');
            }
            const sql = `INSERT INTO public.position (id, drug, count)`
                + `VALUES ('${body.id}', '${body.drug}', '${body.count}')`;
            await server.dbExecute(sql, true);
            res.status(200).send();
        } catch (e) {
            console.error(e);
            res.status(400).send(e);
        }
    }

    server.app.put('/position', putPosition);

    server.app.delete('/position', async (req, res) => {
        try {
            const {id} = req.query;
            if (!id) {
                throw new Error('Empty id');
            }
            const sql = `DELETE FROM public.position WHERE id = '${id}'`;
            await server.dbExecute(sql, true);
            res.status(200).send();
        } catch (e) {
            console.error(e);
            res.status(400).send(e);
        }
    });

} catch (e) {
    console.error(e);
}
