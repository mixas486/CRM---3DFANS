import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { extractBrazilGeo } from '../utils/brazilGeo';

export const runGeoMigration = async () => {
    const contactsRef = collection(db, 'contacts');
    const snapshot = await getDocs(contactsRef);
    const batch = writeBatch(db);
    let count = 0;
    
    snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.ddd && data.estado) return; // Already migrated
        
        // Ensure data.telefoneE164 exists
        if (!data.telefoneE164) return;
        
        const { ddd, state } = extractBrazilGeo(data.telefoneE164 || '');
        if (ddd || state) {
            batch.update(doc(db, 'contacts', docSnap.id), {
                ddd,
                estado: state || data.estado
            });
            count++;
        }
    });
    
    if (count > 0) {
        await batch.commit();
        return count;
    }
    return 0;
};
