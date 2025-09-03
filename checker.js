import { ethers } from 'ethers';
import fs from 'fs';

// ABI для контракта Linea Airdrop (только необходимые функции)
const CONTRACT_ABI = [
    "function calculateAllocation(address _account) view returns (uint256 tokenAllocation)",
    "function hasClaimed(address user) view returns (bool claimed)",
    "function CLAIM_END() view returns (uint256)",
    "function TOKEN() view returns (address)"
];

// Адрес контракта Linea Airdrop
const CONTRACT_ADDRESS = '0x87bAa1694381aE3eCaE2660d97fe60404080Eb64';

// RPC URL для Linea Mainnet
const LINEA_RPC = 'https://rpc.linea.build';

// Создаем провайдер
const provider = new ethers.JsonRpcProvider(LINEA_RPC);

// Создаем экземпляр контракта
const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

// Цвета для консоли
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Функция для чтения адресов из файла
function readWalletsFromFile(filename) {
    try {
        const content = fs.readFileSync(filename, 'utf8');
        return content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && ethers.isAddress(line));
    } catch (error) {
        console.error(`${colors.red}❌ Ошибка при чтении файла wallets.txt:${colors.reset}`, error.message);
        return [];
    }
}

// Функция для форматирования числа с 18 десятичными знаками
function formatTokenAmount(amount, decimals = 18) {
    const formatted = ethers.formatUnits(amount, decimals);
    return parseFloat(formatted).toFixed(6);
}

// Функция для форматирования адреса
function formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Функция для проверки аллокации одного адреса
async function checkAllocation(address) {
    try {
        const [tokenAllocation, hasClaimed, claimEnd, tokenAddress] = await Promise.all([
            contract.calculateAllocation(address),
            contract.hasClaimed(address),
            contract.CLAIM_END(),
            contract.TOKEN()
        ]);

        const now = BigInt(Math.floor(Date.now() / 1000));
        const claimEndBigInt = BigInt(claimEnd);
        const isExpired = now > claimEndBigInt;
        const claimEndDate = new Date(Number(claimEnd) * 1000).toLocaleString('ru-RU');
        
        // Вычисляем время до окончания
        const timeLeft = Number(claimEndBigInt - now);
        const daysLeft = Math.floor(timeLeft / (24 * 60 * 60));
        const hoursLeft = Math.floor((timeLeft % (24 * 60 * 60)) / (60 * 60));

        return {
            address,
            tokenAllocation: formatTokenAmount(tokenAllocation),
            hasClaimed: hasClaimed ? 'Да' : 'Нет',
            isExpired: isExpired ? 'Да' : 'Нет',
            claimEndDate,
            tokenAddress,
            timeLeft: isExpired ? 'Истекло' : `${daysLeft}д ${hoursLeft}ч`,
            rawAllocation: tokenAllocation
        };
    } catch (error) {
        console.error(`${colors.red}Ошибка при проверке адреса ${address}:${colors.reset}`, error.message);
        return {
            address,
            tokenAllocation: 'Ошибка',
            hasClaimed: 'Ошибка',
            isExpired: 'Ошибка',
            claimEndDate: 'Ошибка',
            tokenAddress: 'Ошибка',
            timeLeft: 'Ошибка',
            rawAllocation: ethers.parseUnits('0', 18)
        };
    }
}

// Функция для вывода результатов в виде таблицы
function displayResults(results) {
    console.log('\n' + '='.repeat(80));
    console.log(`${colors.bright}${colors.cyan}🎯 РЕЗУЛЬТАТЫ ПРОВЕРКИ АЛЛОКАЦИЙ LINEA${colors.reset}`);
    console.log('='.repeat(80));
    
    // Заголовок таблицы с одинаковой шириной столбцов
    const headerAddress = `${colors.bright}Адрес${colors.reset}`.padEnd(40);
    const headerAllocation = `${colors.bright}Аллокация${colors.reset}`.padEnd(25);
    const headerClaimed = `${colors.bright}Заявлено${colors.reset}`.padEnd(15);
    
    console.log(`${headerAddress} | ${headerAllocation} | ${headerClaimed}`);
    console.log('-'.repeat(80));
    
    // Данные
    results.forEach(result => {
        const allocationColor = result.tokenAllocation === 'Ошибка' ? colors.red : 
                              parseFloat(result.tokenAllocation) > 0 ? colors.green : colors.yellow;
        const claimedColor = result.hasClaimed === 'Да' ? colors.green : 
                           result.hasClaimed === 'Ошибка' ? colors.red : colors.yellow;
        
        // Форматируем каждое поле с точно такой же шириной как заголовки
        const addressField = `${colors.blue}${formatAddress(result.address)}${colors.reset}`.padEnd(40);
        const allocationField = `${allocationColor}${result.tokenAllocation}${colors.reset}`.padEnd(25);
        const claimedField = `${claimedColor}${result.hasClaimed}${colors.reset}`.padEnd(15);
        
        // Выводим строку с точно таким же форматированием как заголовок
        console.log(`${addressField} | ${allocationField} | ${claimedField}`);
    });
    
    console.log('-'.repeat(80));
    
    // Статистика
    const totalAllocation = results.reduce((sum, r) => {
        if (r.rawAllocation && typeof r.rawAllocation === 'bigint') {
            return sum + parseFloat(ethers.formatUnits(r.rawAllocation, 18));
        }
        return sum;
    }, 0);
    
    const claimedCount = results.filter(r => r.hasClaimed === 'Да').length;
    const errorCount = results.filter(r => r.tokenAllocation === 'Ошибка').length;
    
    console.log(`${colors.bright}📊 СТАТИСТИКА:${colors.reset}`);
    console.log(`${colors.green}• Всего аллокаций: ${totalAllocation.toFixed(6)} токенов${colors.reset}`);
    console.log(`${colors.blue}• Уже заявлено: ${claimedCount} адресов${colors.reset}`);
    if (errorCount > 0) {
        console.log(`${colors.red}• Ошибки: ${errorCount} адресов${colors.reset}`);
    }
    
    // Топ аллокаций
    const validResults = results.filter(r => r.tokenAllocation !== 'Ошибка' && parseFloat(r.tokenAllocation) > 0);
    if (validResults.length > 0) {
        validResults.sort((a, b) => parseFloat(b.tokenAllocation) - parseFloat(a.tokenAllocation));
        console.log(`\n${colors.bright}🏆 ТОП-3 АЛЛОКАЦИИ:${colors.reset}`);
        validResults.slice(0, 3).forEach((result, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
            console.log(`${medal} ${formatAddress(result.address)}: ${colors.green}${result.tokenAllocation}${colors.reset} токенов`);
        });
    }
    
    console.log('='.repeat(80));
}

// Основная функция
async function main() {
    console.log(`${colors.bright}${colors.cyan}🚀 Запуск чекера аллокаций Linea...${colors.reset}`);
    console.log(`${colors.yellow}📋 Контракт: ${CONTRACT_ADDRESS}${colors.reset}`);
    console.log(`${colors.yellow}🌐 Сеть: Linea Mainnet${colors.reset}\n`);
    
    // Читаем адреса из файла
    const wallets = readWalletsFromFile('wallets.txt');
    
    if (wallets.length === 0) {
        console.error(`${colors.red}❌ Не найдено валидных адресов в файле wallets.txt${colors.reset}`);
        console.log(`${colors.yellow}💡 Создайте файл wallets.txt с адресами кошельков (по одному на строку)${colors.reset}`);
        return;
    }
    
    console.log(`${colors.green}📋 Найдено ${wallets.length} адресов для проверки${colors.reset}`);
    console.log(`${colors.blue}⏳ Проверяем аллокации...${colors.reset}\n`);
    
    // Проверяем каждый адрес
    const results = [];
    for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];
        const progress = `${colors.cyan}Проверка ${i + 1}/${wallets.length}:${colors.reset} ${formatAddress(wallet)}`;
        process.stdout.write(`\r${progress}`);
        
        const result = await checkAllocation(wallet);
        results.push(result);
        
        // Небольшая задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n'); // Новая строка после прогресс-бара
    
    // Выводим результаты
    displayResults(results);
    
    console.log(`\n${colors.green}✅ Проверка завершена!${colors.reset}`);
}

// Обработка ошибок
process.on('unhandledRejection', (error) => {
    console.error(`${colors.red}❌ Необработанная ошибка:${colors.reset}`, error);
    process.exit(1);
});

// Запускаем программу
main().catch(console.error);
