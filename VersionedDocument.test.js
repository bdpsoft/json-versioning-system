const VersionedDocument = require('./VersionedDocument');

describe('VersionedDocument System Tests', () => {
    const schema = {
        _maxHistory: 3,
        _maxCharLimit: 500,
        _minTimeGap: 0, // 0 za testiranje da ne bismo čekali sekunde
        fields: {
            title: { type: 'string', required: true, maxLength: 20 },
            content: { type: 'string', required: false }
        }
    };

    let doc;

    beforeEach(() => {
        doc = new VersionedDocument({ title: 'Start' }, schema);
    });

    test('Treba da inicijalizuje dokument na verziju 1', () => {
        expect(doc.toJSON()._version).toBe(1);
    });

    test('Treba uspešno da ažurira podatke i poveća verziju', () => {
        doc.update({ title: 'Naslov 2' }, 1);
        expect(doc.toJSON()._version).toBe(2);
        expect(doc.toJSON().title).toBe('Naslov 2');
    });

    test('Treba da baci grešku ako je verzija pogrešna (Concurrency Check)', () => {
        expect(() => {
            doc.update({ title: 'Greška' }, 5);
        }).toThrow(/Concurrency error/);
    });

    test('Treba da detektuje diff i sačuva ga u arhivi', () => {
        doc.update({ title: 'Promena' }, 1);
        const log = doc.toJSON();
        expect(log._archive.length).toBe(1);
        expect(log._archive[0]._diff[0].field).toBe('title');
    });

    test('Treba da vrati snapshot stare verzije bez meta-podataka', () => {
        doc.update({ title: 'Nova' }, 1);
        const old = doc.getSnapshot(1);
        expect(old.title).toBe('Start');
        expect(old._version).toBeUndefined();
    });

    test('Treba da baci grešku ako se premaši limit karaktera', () => {
        const dugačakTekst = "a".repeat(600);
        expect(() => {
            doc.update({ content: dugačakTekst }, 1);
        }).toThrow(/Size limit error/);
    });

    test('Garbage Collection: Arhiva ne sme preći _maxHistory', () => {
        doc.update({ title: 'V2' }, 1);
        doc.update({ title: 'V3' }, 2);
        doc.update({ title: 'V4' }, 3);
        doc.update({ title: 'V5' }, 4);
        
        expect(doc.toJSON()._archive.length).toBe(3); // _maxHistory je 3
    });

    test('getRemainingChars treba da opada kako se dodaju podaci', () => {
        const pocetno = doc.getRemainingChars();
        doc.update({ content: 'Neki sadržaj' }, 1);
        const nakon = doc.getRemainingChars();
        expect(nakon).toBeLessThan(pocetno);
    });
});