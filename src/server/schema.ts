import { query, scalar } from './query';

export async function tableExists(table: string): Promise<boolean> {
    const result = await scalar<boolean>(
        'SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)',
        [table],
    );

    return Boolean(result);
}

export interface ColumnInfo {
    column_name: string;
    data_type: string;
    is_nullable: 'YES' | 'NO';
    column_default: string | null;
}

export async function columns(table: string): Promise<ColumnInfo[]> {
    const result = await query<ColumnInfo>(
        'SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
        [table],
    );

    return result.rows;
}
